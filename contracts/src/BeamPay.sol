// SPDX-License-Identifier: MIT
// BeamPay: Beam's onchain payment router for agent-prepared payments.
// The ABI and EIP-712 types are mirrored in app/src/beamPay.ts and server/src/beamPay.ts;
// server/test/beamPayAbi.test.ts checks them against the compiled artifact.
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title BeamPay
/// @notice Forwards the native token, emits an onchain receipt for every agent payment,
/// and enforces a per-account cap that only a World-ID-backed approval can exceed.
/// @dev No owner, no admin, no upgradeability. The contract never holds funds: every
/// payment forwards `msg.value` in the same call, and there is no receive or fallback.
/// The cap guards the agent path only; users can always send funds directly.
contract BeamPay is EIP712 {
    /// @dev EIP-712 typehash of a payment approval. Field order must match `APPROVAL_TYPES` in beamPay.ts.
    bytes32 private constant PAY_APPROVAL_TYPEHASH = keccak256(
        "PayApproval(address payer,address to,uint256 amount,bytes32 intentHash,uint256 nonce,uint256 deadline)"
    );
    /// @dev EIP-712 typehash of a cap-raise approval.
    bytes32 private constant CAP_APPROVAL_TYPEHASH =
        keccak256("CapApproval(address account,uint256 cap,uint256 nonce,uint256 deadline)");
    /// @dev EIP-712 typehash of a World ID link approval.
    bytes32 private constant HUMAN_LINK_TYPEHASH =
        keccak256("HumanLink(address account,bytes32 humanHash,uint256 nonce,uint256 deadline)");

    /// @notice Highest cap any account can have, in wei (1,000 native units).
    uint256 public constant MAX_CAP = 1_000e18;

    /// @notice Beam server key that signs approvals. It can authorize, never move funds.
    address public immutable approver;
    /// @notice Per-payment cap for accounts that never changed theirs, in wei.
    uint256 public immutable defaultCap;

    /// @notice Per-account cap override in wei; 0 means `defaultCap`.
    mapping(address => uint256) public capOf;
    /// @notice Salted World ID binding per account; 0 when unlinked.
    mapping(address => bytes32) public humanOf;
    /// @notice Next approval nonce per account, consumed by every signed approval.
    mapping(address => uint256) public nonces;

    /// @notice Receipt for a payment routed through Beam.
    /// @param from Payer.
    /// @param to Recipient.
    /// @param amount Amount forwarded, in wei.
    /// @param intentHash `keccak256(abi.encode(intentId, to, amountWei, chainId))` of the reviewed intent.
    /// @param sourceApp App the payment was captured from; empty for user-typed recipients.
    /// @param approved True when the payment carried a World-ID-backed approval.
    event AgentPayment(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed intentHash,
        string sourceApp,
        bool approved
    );
    /// @notice An account's per-payment cap changed.
    /// @param account Account whose cap changed.
    /// @param cap New cap in wei.
    event CapChanged(address indexed account, uint256 cap);
    /// @notice An account was linked (or re-linked) to a World ID human.
    /// @param account Linked account.
    /// @param humanHash Salted World ID hash now bound to the account.
    event HumanLinked(address indexed account, bytes32 humanHash);

    /// @notice Recipient or approver is the zero address.
    error ZeroAddress();
    /// @notice Payment carries no value.
    error ZeroAmount();
    /// @notice Payment exceeds the caller's cap on the unapproved path.
    /// @param cap The caller's current cap in wei.
    error OverCap(uint256 cap);
    /// @notice The approval's deadline has passed.
    error Expired();
    /// @notice The approval was not signed by `approver` for these exact fields and nonce.
    error BadSignature();
    /// @notice The caller has no linked human, or a link would bind the zero hash.
    error NotLinked();
    /// @notice The recipient rejected the native transfer.
    error TransferFailed();
    /// @notice The cap is zero, above `MAX_CAP`, or not lower than the current cap.
    error InvalidCap();

    /// @notice Deploys BeamPay with a fixed approver and default cap.
    /// @param approver_ Beam server approval key; cannot be zero.
    /// @param defaultCap_ Default per-payment cap in wei; nonzero and at most `MAX_CAP`.
    constructor(address approver_, uint256 defaultCap_) EIP712("BeamPay", "1") {
        if (approver_ == address(0)) revert ZeroAddress();
        if (defaultCap_ == 0 || defaultCap_ > MAX_CAP) revert InvalidCap();
        approver = approver_;
        defaultCap = defaultCap_;
    }

    /// @notice Pays `to` with `msg.value`, up to the caller's cap, without an approval.
    /// @param to Recipient.
    /// @param intentHash Hash of the intent the user reviewed.
    /// @param sourceApp App the payment was captured from (at most 32 bytes, enforced by the client).
    function pay(address to, bytes32 intentHash, string calldata sourceApp) external payable {
        _checkPayment(to);
        uint256 cap = capFor(msg.sender);
        if (msg.value > cap) revert OverCap(cap);
        _forward(to, intentHash, sourceApp, false);
    }

    /// @notice Pays `to` with `msg.value` above the cap, authorized by an approver-signed `PayApproval`.
    /// @dev The nonce is consumed before the external call (checks, effects, interactions).
    /// @param to Recipient.
    /// @param intentHash Hash of the intent the user reviewed and the server approved.
    /// @param sourceApp App the payment was captured from.
    /// @param deadline Last valid timestamp of the approval.
    /// @param signature Approver's EIP-712 signature over `PayApproval`.
    function payWithApproval(
        address to,
        bytes32 intentHash,
        string calldata sourceApp,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        _checkPayment(to);
        if (humanOf[msg.sender] == bytes32(0)) revert NotLinked();
        _useApproval(
            abi.encode(PAY_APPROVAL_TYPEHASH, msg.sender, to, msg.value, intentHash, nonces[msg.sender], deadline),
            deadline,
            signature
        );
        _forward(to, intentHash, sourceApp, true);
    }

    /// @notice Lowers the caller's cap. Needs no approval, because it only reduces what the agent path can spend.
    /// @param cap New cap in wei; nonzero and below the current cap.
    function lowerCap(uint256 cap) external {
        if (cap == 0 || cap >= capFor(msg.sender)) revert InvalidCap();
        _setCap(cap);
    }

    /// @notice Sets the caller's cap to `cap`, authorized by an approver-signed `CapApproval`.
    /// @param cap New cap in wei; nonzero and at most `MAX_CAP`.
    /// @param deadline Last valid timestamp of the approval.
    /// @param signature Approver's EIP-712 signature over `CapApproval`.
    function raiseCap(uint256 cap, uint256 deadline, bytes calldata signature) external {
        if (cap == 0 || cap > MAX_CAP) revert InvalidCap();
        _useApproval(
            abi.encode(CAP_APPROVAL_TYPEHASH, msg.sender, cap, nonces[msg.sender], deadline), deadline, signature
        );
        _setCap(cap);
    }

    /// @notice Binds the caller to a salted World ID hash, authorized by an approver-signed `HumanLink`.
    /// @dev Re-linking a different human uses the same path; the server signs it only after
    /// verifying the currently linked human.
    /// @param humanHash Salted World ID hash; nonzero.
    /// @param deadline Last valid timestamp of the approval.
    /// @param signature Approver's EIP-712 signature over `HumanLink`.
    function linkHuman(bytes32 humanHash, uint256 deadline, bytes calldata signature) external {
        if (humanHash == bytes32(0)) revert NotLinked();
        _useApproval(
            abi.encode(HUMAN_LINK_TYPEHASH, msg.sender, humanHash, nonces[msg.sender], deadline), deadline, signature
        );
        humanOf[msg.sender] = humanHash;
        emit HumanLinked(msg.sender, humanHash);
    }

    /// @notice Per-payment cap of `account` on the unapproved path.
    /// @param account Account to query.
    /// @return The account's cap in wei, or `defaultCap` if it never set one.
    function capFor(address account) public view returns (uint256) {
        uint256 cap = capOf[account];
        return cap == 0 ? defaultCap : cap;
    }

    /// @dev Reverts on a zero recipient or zero value.
    /// @param to Recipient.
    function _checkPayment(address to) private view {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
    }

    /// @dev Checks the deadline and the approver's signature over `structData`, then consumes the caller's nonce.
    /// @param structData ABI-encoded typehash and fields, including the caller's current nonce.
    /// @param deadline Last valid timestamp of the approval.
    /// @param signature Approver's EIP-712 signature.
    function _useApproval(bytes memory structData, uint256 deadline, bytes calldata signature) private {
        // Deadlines are minutes long; validator drift of a few seconds does not matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(keccak256(structData)), signature);
        // tryRecover returns address(0) with an error; approver is nonzero, so both checks reject it.
        if (err != ECDSA.RecoverError.NoError || signer != approver) revert BadSignature();
        unchecked {
            ++nonces[msg.sender];
        }
    }

    /// @dev Stores the caller's cap and emits `CapChanged`.
    /// @param cap New cap in wei.
    function _setCap(uint256 cap) private {
        capOf[msg.sender] = cap;
        emit CapChanged(msg.sender, cap);
    }

    /// @dev Emits the receipt, then forwards `msg.value` to `to`. Called after all state changes.
    /// @param to Recipient.
    /// @param intentHash Hash of the reviewed intent.
    /// @param sourceApp App the payment was captured from.
    /// @param approved Whether the payment carried an approval.
    function _forward(address to, bytes32 intentHash, string calldata sourceApp, bool approved) private {
        emit AgentPayment(msg.sender, to, msg.value, intentHash, sourceApp, approved);
        (bool ok,) = to.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }
}
