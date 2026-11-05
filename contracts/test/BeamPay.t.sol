// SPDX-License-Identifier: MIT
// Foundry tests for BeamPay (PLAN.md section 6.4). Signatures are produced with vm.sign over EIP-712
// digests recomputed here from the type strings, never from contract helpers, so the tests prove the
// contract's encoding. test_ViemVectors pins the same digests to viem's output.
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {BeamPay} from "../src/BeamPay.sol";

/// @notice Recipient without receive or fallback: every native transfer to it fails.
contract RejectingRecipient {}

/// @notice Payer that pays itself with an approval and, on receipt, replays the same approval.
contract ReentrantPayer {
    /// @dev BeamPay under test.
    BeamPay private immutable beamPay;
    /// @dev Intent hash of the approved payment.
    bytes32 private intentHash;
    /// @dev Deadline of the approved payment.
    uint256 private deadline;
    /// @dev Approver signature of the approved payment.
    bytes private signature;
    /// @dev True once the replay was attempted, so it runs once.
    bool private reentered;
    /// @notice Revert data of the replayed call; empty if the replay succeeded.
    bytes public replayError;

    /// @param beamPay_ BeamPay under test.
    constructor(BeamPay beamPay_) {
        beamPay = beamPay_;
    }

    /// @notice Pays `msg.value` to this contract with an approval.
    /// @param intentHash_ Approved intent hash.
    /// @param deadline_ Approval deadline.
    /// @param signature_ Approver signature for payer = recipient = this contract.
    function attack(bytes32 intentHash_, uint256 deadline_, bytes calldata signature_) external payable {
        (intentHash, deadline, signature) = (intentHash_, deadline_, signature_);
        beamPay.payWithApproval{value: msg.value}(address(this), intentHash_, "", deadline_, signature_);
    }

    /// @notice Replays the approval once while BeamPay's outer call is still running.
    receive() external payable {
        if (reentered) return;
        reentered = true;
        try beamPay.payWithApproval{value: msg.value}(address(this), intentHash, "", deadline, signature) {}
        catch (bytes memory reason) {
            replayError = reason;
        }
    }
}

/// @notice Unit and fuzz tests for BeamPay.
contract BeamPayTest is Test {
    /// @dev Default cap used in these tests (Arc: 25 USDC).
    uint256 private constant DEFAULT_CAP = 25e18;
    /// @dev Approver private key.
    uint256 private constant APPROVER_PK = 0xA99;
    /// @dev A key that is not the approver.
    uint256 private constant MALLORY_PK = 0xBAD;

    /// @dev EIP712Domain typehash, from the EIP-712 spec.
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    /// @dev Typehashes copied from APPROVAL_TYPES in beamPay.ts.
    bytes32 private constant PAY_TYPEHASH = keccak256(
        "PayApproval(address payer,address to,uint256 amount,bytes32 intentHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant CAP_TYPEHASH =
        keccak256("CapApproval(address account,uint256 cap,uint256 nonce,uint256 deadline)");
    bytes32 private constant LINK_TYPEHASH =
        keccak256("HumanLink(address account,bytes32 humanHash,uint256 nonce,uint256 deadline)");

    /// @dev Digests and intent hash printed by `node contracts/test/eip712Vectors.mjs` (viem 2.41.2 and the
    /// shared server/src/beamPay.ts). Regenerate with that command if the fixed inputs in test_ViemVectors change.
    bytes32 private constant VIEM_INTENT_HASH = 0x754ad3ed5d96ec93000b5ddc93b9e1ea74edeeeeb951f66f5d762694cab9e5cc;
    bytes32 private constant VIEM_LINK_DIGEST = 0x959ae68fbce2bd3f5a0e935ff03271d6d869947332e53103786b2fda6941794e;
    bytes32 private constant VIEM_CAP_DIGEST = 0x58998b90014ffa4b75ac642efd60d317d30dc8cfdbb53aa2a0bc97c39623008f;
    bytes32 private constant VIEM_PAY_DIGEST = 0xd8d1a01321294c65025a0dc200ad283c90259abd4c8f2c80754575c12a4cbbca;

    BeamPay private beamPay;
    address private approver;
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    bytes32 private intentHash = keccak256("intent");
    uint256 private deadline;

    /// @notice Deploys BeamPay and funds alice.
    function setUp() public {
        approver = vm.addr(APPROVER_PK);
        beamPay = new BeamPay(approver, DEFAULT_CAP);
        deadline = block.timestamp + 5 minutes;
        vm.deal(alice, 10_000e18);
    }

    // ------------------------------------------------------------------ helpers

    /// @dev EIP-712 digest of `structHash` for an BeamPay at `verifyingContract` on the current chain.
    function _digestAt(address verifyingContract, bytes32 structHash) private view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("BeamPay"), keccak256("1"), block.chainid, verifyingContract)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @dev `pk`'s 65-byte (r, s, v) signature over `digest`.
    function _sign(uint256 pk, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev `pk`'s signature over a PayApproval for `beamPay`.
    function _signPay(uint256 pk, address payer, address to, uint256 amount, bytes32 hash, uint256 nonce, uint256 dl)
        private
        view
        returns (bytes memory)
    {
        return
            _sign(
                pk, _digestAt(address(beamPay), keccak256(abi.encode(PAY_TYPEHASH, payer, to, amount, hash, nonce, dl)))
            );
    }

    /// @dev Approver signature over a CapApproval for `beamPay`.
    function _signCap(address account, uint256 cap, uint256 nonce, uint256 dl) private view returns (bytes memory) {
        return
            _sign(APPROVER_PK, _digestAt(address(beamPay), keccak256(abi.encode(CAP_TYPEHASH, account, cap, nonce, dl))));
    }

    /// @dev Approver signature over a HumanLink for `beamPay`.
    function _signLink(address account, bytes32 humanHash, uint256 nonce, uint256 dl)
        private
        view
        returns (bytes memory)
    {
        return _sign(
            APPROVER_PK, _digestAt(address(beamPay), keccak256(abi.encode(LINK_TYPEHASH, account, humanHash, nonce, dl)))
        );
    }

    /// @dev Links `account` to a test human with the approver's signature.
    function _link(address account) private {
        bytes memory sig = _signLink(account, keccak256(abi.encode(account)), beamPay.nonces(account), deadline);
        vm.prank(account);
        beamPay.linkHuman(keccak256(abi.encode(account)), deadline, sig);
    }

    /// @dev Links alice and returns an approver signature for alice paying bob `amount` with `intentHash`.
    function _linkedAliceApproval(uint256 amount) private returns (bytes memory) {
        _link(alice);
        return _signPay(APPROVER_PK, alice, bob, amount, intentHash, beamPay.nonces(alice), deadline);
    }

    // ---------------------------------------------------------------------- pay

    /// @notice A payment within the cap reaches the recipient and emits an unapproved receipt.
    function test_Pay_WithinCap() public {
        vm.expectEmit(address(beamPay));
        emit BeamPay.AgentPayment(alice, bob, 10e18, intentHash, "WhatsApp", false);
        vm.prank(alice);
        beamPay.pay{value: 10e18}(bob, intentHash, "WhatsApp");
        assertEq(bob.balance, 10e18);
        assertEq(address(beamPay).balance, 0);
    }

    /// @notice A payment of exactly the cap is allowed.
    function test_Pay_AtCap() public {
        vm.prank(alice);
        beamPay.pay{value: DEFAULT_CAP}(bob, intentHash, "");
        assertEq(bob.balance, DEFAULT_CAP);
    }

    /// @notice A payment over the cap reverts with the cap.
    function test_Pay_RevertsOverCap() public {
        vm.expectRevert(abi.encodeWithSelector(BeamPay.OverCap.selector, DEFAULT_CAP));
        vm.prank(alice);
        beamPay.pay{value: DEFAULT_CAP + 1}(bob, intentHash, "");
    }

    /// @notice Paying the zero address reverts.
    function test_Pay_RevertsZeroAddress() public {
        vm.expectRevert(BeamPay.ZeroAddress.selector);
        vm.prank(alice);
        beamPay.pay{value: 1}(address(0), intentHash, "");
    }

    /// @notice A zero-value payment reverts.
    function test_Pay_RevertsZeroAmount() public {
        vm.expectRevert(BeamPay.ZeroAmount.selector);
        vm.prank(alice);
        beamPay.pay(bob, intentHash, "");
    }

    /// @notice A recipient that rejects the transfer makes the payment revert.
    function test_Pay_RevertsWhenRecipientRejects() public {
        address rejector = address(new RejectingRecipient());
        vm.expectRevert(BeamPay.TransferFailed.selector);
        vm.prank(alice);
        beamPay.pay{value: 1e18}(rejector, intentHash, "");
    }

    /// @notice Around a fuzzed cap, payments up to the cap succeed and anything above reverts with the cap.
    function testFuzz_Pay_AroundCap(uint256 cap, uint256 amount) public {
        cap = bound(cap, 1, DEFAULT_CAP);
        amount = bound(amount, 1, 2 * cap);
        vm.startPrank(alice);
        if (cap < DEFAULT_CAP) beamPay.lowerCap(cap);
        if (amount > cap) vm.expectRevert(abi.encodeWithSelector(BeamPay.OverCap.selector, cap));
        beamPay.pay{value: amount}(bob, intentHash, "");
        vm.stopPrank();
        assertEq(bob.balance, amount > cap ? 0 : amount);
        assertEq(address(beamPay).balance, 0);
    }

    // ---------------------------------------------------------- payWithApproval

    /// @notice An approved over-cap payment succeeds, emits `approved = true` and consumes the nonce.
    function test_PayWithApproval_HappyPath() public {
        uint256 amount = 100e18;
        bytes memory sig = _linkedAliceApproval(amount);
        vm.expectEmit(address(beamPay));
        emit BeamPay.AgentPayment(alice, bob, amount, intentHash, "Chrome", true);
        vm.prank(alice);
        beamPay.payWithApproval{value: amount}(bob, intentHash, "Chrome", deadline, sig);
        assertEq(bob.balance, amount);
        assertEq(beamPay.nonces(alice), 2); // link + pay
    }

    /// @notice The approval is valid up to and including its deadline.
    function test_PayWithApproval_AtDeadline() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.warp(deadline);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
        assertEq(bob.balance, 1e18);
    }

    /// @notice An approval past its deadline reverts.
    function test_PayWithApproval_RevertsExpired() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.warp(deadline + 1);
        vm.expectRevert(BeamPay.Expired.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
    }

    /// @notice A signature by a key other than the approver reverts.
    function test_PayWithApproval_RevertsWrongSigner() public {
        _link(alice);
        bytes memory sig = _signPay(MALLORY_PK, alice, bob, 1e18, intentHash, 1, deadline);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
    }

    /// @notice A malformed signature reverts instead of recovering a garbage signer.
    function test_PayWithApproval_RevertsMalformedSignature() public {
        _link(alice);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, hex"1234");
    }

    /// @notice An approval for one amount cannot send another.
    function test_PayWithApproval_RevertsDifferentAmount() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 2e18}(bob, intentHash, "", deadline, sig);
    }

    /// @notice An approval for one recipient cannot pay another.
    function test_PayWithApproval_RevertsDifferentRecipient() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(makeAddr("mallory"), intentHash, "", deadline, sig);
    }

    /// @notice An approval for one intent cannot be used for another.
    function test_PayWithApproval_RevertsDifferentIntent() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, keccak256("other intent"), "", deadline, sig);
    }

    /// @notice An approval for one payer cannot be used by another linked account.
    function test_PayWithApproval_RevertsDifferentPayer() public {
        address carol = makeAddr("carol");
        vm.deal(carol, 1e18);
        _link(carol);
        _link(alice);
        // Same nonce as carol's, so only the payer field differs.
        bytes memory sig = _signPay(APPROVER_PK, alice, bob, 1e18, intentHash, 1, deadline);
        vm.expectRevert(BeamPay.BadSignature.selector);
        vm.prank(carol);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
    }

    /// @notice A used approval cannot be replayed.
    function test_PayWithApproval_RevertsReplay() public {
        bytes memory sig = _linkedAliceApproval(1e18);
        vm.startPrank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
        vm.stopPrank();
    }

    /// @notice An account without a linked human cannot use the approval path, even with a valid signature.
    function test_PayWithApproval_RevertsNotLinked() public {
        bytes memory sig = _signPay(APPROVER_PK, alice, bob, 1e18, intentHash, 0, deadline);
        vm.expectRevert(BeamPay.NotLinked.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(bob, intentHash, "", deadline, sig);
    }

    /// @notice A failed transfer reverts the whole call, so the approval's nonce is not burned.
    function test_PayWithApproval_TransferFailedKeepsNonce() public {
        address rejector = address(new RejectingRecipient());
        _link(alice);
        bytes memory sig = _signPay(APPROVER_PK, alice, rejector, 1e18, intentHash, 1, deadline);
        vm.expectRevert(BeamPay.TransferFailed.selector);
        vm.prank(alice);
        beamPay.payWithApproval{value: 1e18}(rejector, intentHash, "", deadline, sig);
        assertEq(beamPay.nonces(alice), 1);
    }

    /// @notice A recipient that re-enters with the same approval is rejected: the nonce is consumed
    /// before the transfer, so one approval moves funds exactly once.
    function test_PayWithApproval_ReentrantRecipientCannotDoubleSpend() public {
        ReentrantPayer attacker = new ReentrantPayer(beamPay);
        vm.deal(address(attacker), 0);
        _link(address(attacker));
        bytes memory sig = _signPay(APPROVER_PK, address(attacker), address(attacker), 50e18, intentHash, 1, deadline);

        vm.recordLogs();
        attacker.attack{value: 50e18}(intentHash, deadline, sig);

        assertEq(attacker.replayError(), abi.encodeWithSelector(BeamPay.BadSignature.selector));
        assertEq(beamPay.nonces(address(attacker)), 2);
        assertEq(address(attacker).balance, 50e18);
        assertEq(address(beamPay).balance, 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 payments;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == BeamPay.AgentPayment.selector) ++payments;
        }
        assertEq(payments, 1);
    }

    // --------------------------------------------------------------------- caps

    /// @notice `capFor` returns the default until an account sets its own cap.
    function test_CapFor_DefaultsUntilSet() public {
        assertEq(beamPay.capFor(alice), DEFAULT_CAP);
        vm.prank(alice);
        beamPay.lowerCap(5e18);
        assertEq(beamPay.capFor(alice), 5e18);
        assertEq(beamPay.capFor(bob), DEFAULT_CAP);
    }

    /// @notice Lowering the cap needs no approval, emits `CapChanged` and is enforced by `pay`.
    function test_LowerCap() public {
        vm.expectEmit(address(beamPay));
        emit BeamPay.CapChanged(alice, 5e18);
        vm.startPrank(alice);
        beamPay.lowerCap(5e18);
        vm.expectRevert(abi.encodeWithSelector(BeamPay.OverCap.selector, 5e18));
        beamPay.pay{value: 6e18}(bob, intentHash, "");
        vm.stopPrank();
    }

    /// @notice Lowering to zero, to the current cap or above it reverts.
    function test_LowerCap_RevertsInvalid() public {
        vm.startPrank(alice);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        beamPay.lowerCap(0);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        beamPay.lowerCap(DEFAULT_CAP);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        beamPay.lowerCap(DEFAULT_CAP + 1);
        vm.stopPrank();
    }

    /// @notice An approved raise applies, emits `CapChanged`, consumes the nonce and cannot be replayed.
    function test_RaiseCap() public {
        bytes memory sig = _signCap(alice, 100e18, 0, deadline);
        vm.expectEmit(address(beamPay));
        emit BeamPay.CapChanged(alice, 100e18);
        vm.startPrank(alice);
        beamPay.raiseCap(100e18, deadline, sig);
        assertEq(beamPay.capFor(alice), 100e18);
        assertEq(beamPay.nonces(alice), 1);
        beamPay.pay{value: 100e18}(bob, intentHash, "");
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.raiseCap(100e18, deadline, sig);
        vm.stopPrank();
    }

    /// @notice The cap can be raised to exactly `MAX_CAP` but not beyond, or to zero.
    function test_RaiseCap_MaxCap() public {
        assertEq(beamPay.MAX_CAP(), 1_000e18);
        uint256 maxCap = beamPay.MAX_CAP();
        vm.startPrank(alice);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        beamPay.raiseCap(maxCap + 1, deadline, _signCap(alice, maxCap + 1, 0, deadline));
        vm.expectRevert(BeamPay.InvalidCap.selector);
        beamPay.raiseCap(0, deadline, _signCap(alice, 0, 0, deadline));
        beamPay.raiseCap(maxCap, deadline, _signCap(alice, maxCap, 0, deadline));
        vm.stopPrank();
        assertEq(beamPay.capFor(alice), maxCap);
    }

    /// @notice A raise needs the approver's signature for this account and cap, before the deadline.
    function test_RaiseCap_RevertsBadApproval() public {
        vm.startPrank(alice);
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.raiseCap(200e18, deadline, _signCap(alice, 100e18, 0, deadline));
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.raiseCap(100e18, deadline, _signCap(bob, 100e18, 0, deadline));
        vm.warp(deadline + 1);
        vm.expectRevert(BeamPay.Expired.selector);
        beamPay.raiseCap(100e18, deadline, _signCap(alice, 100e18, 0, deadline));
        vm.stopPrank();
    }

    // -------------------------------------------------------------- linkHuman

    /// @notice Linking stores the hash; re-linking a different human needs a fresh signature.
    function test_LinkHuman_LinkAndRelink() public {
        bytes32 first = keccak256("human 1");
        bytes32 second = keccak256("human 2");
        bytes memory firstSig = _signLink(alice, first, 0, deadline);
        vm.startPrank(alice);
        vm.expectEmit(address(beamPay));
        emit BeamPay.HumanLinked(alice, first);
        beamPay.linkHuman(first, deadline, firstSig);
        assertEq(beamPay.humanOf(alice), first);

        // The old signature cannot be reused, and a signature for one hash cannot link another.
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.linkHuman(first, deadline, firstSig);
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.linkHuman(second, deadline, _signLink(alice, first, 1, deadline));

        beamPay.linkHuman(second, deadline, _signLink(alice, second, 1, deadline));
        vm.stopPrank();
        assertEq(beamPay.humanOf(alice), second);
        assertEq(beamPay.nonces(alice), 2);
    }

    /// @notice Linking the zero hash, with an expired approval or a foreign signer reverts.
    function test_LinkHuman_RevertsInvalid() public {
        bytes32 human = keccak256("human");
        vm.startPrank(alice);
        vm.expectRevert(BeamPay.NotLinked.selector);
        beamPay.linkHuman(bytes32(0), deadline, _signLink(alice, bytes32(0), 0, deadline));
        vm.expectRevert(BeamPay.BadSignature.selector);
        beamPay.linkHuman(human, deadline, _signLink(bob, human, 0, deadline));
        vm.warp(deadline + 1);
        vm.expectRevert(BeamPay.Expired.selector);
        beamPay.linkHuman(human, deadline, _signLink(alice, human, 0, deadline));
        vm.stopPrank();
    }

    // ------------------------------------------------------------ deployment

    /// @notice The constructor stores its arguments and rejects a zero approver or an out-of-range default cap.
    function test_Constructor() public {
        assertEq(beamPay.approver(), approver);
        assertEq(beamPay.defaultCap(), DEFAULT_CAP);
        vm.expectRevert(BeamPay.ZeroAddress.selector);
        new BeamPay(address(0), DEFAULT_CAP);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        new BeamPay(approver, 1_000e18 + 1);
        vm.expectRevert(BeamPay.InvalidCap.selector);
        new BeamPay(approver, 0);
    }

    /// @notice Plain value transfers to BeamPay are rejected (no receive or fallback).
    function test_RejectsStrayValue() public {
        vm.prank(alice);
        (bool ok,) = address(beamPay).call{value: 1e18}("");
        assertFalse(ok);
        assertEq(address(beamPay).balance, 0);
    }

    // ------------------------------------------------------------ viem vectors

    /// @notice Digests computed here equal viem's `hashTypedData` for the shared types, and the contract
    /// accepts approver signatures over viem's digests end to end (link, raise, pay).
    function test_ViemVectors() public {
        // Fixed inputs; keep in sync with contracts/test/eip712Vectors.mjs.
        vm.chainId(5042002); // Arc testnet
        address at = address(0xC0FFEE);
        deployCodeTo("BeamPay.sol:BeamPay", abi.encode(approver, DEFAULT_CAP), at);
        BeamPay arcPay = BeamPay(at);
        address account = vm.addr(0xA11CE);
        address to = address(0xB0B);
        uint256 dl = 1_900_000_000;
        bytes32 human = keccak256("human");
        uint256 amount = 30e18;

        // Same encoding as computeIntentHash in beamPay.ts.
        bytes32 hash = keccak256(abi.encode("11111111-1111-4111-8111-111111111111", to, amount, uint256(5042002)));
        assertEq(hash, VIEM_INTENT_HASH);
        assertEq(_digestAt(at, keccak256(abi.encode(LINK_TYPEHASH, account, human, 0, dl))), VIEM_LINK_DIGEST);
        assertEq(_digestAt(at, keccak256(abi.encode(CAP_TYPEHASH, account, 100e18, 1, dl))), VIEM_CAP_DIGEST);
        assertEq(_digestAt(at, keccak256(abi.encode(PAY_TYPEHASH, account, to, amount, hash, 2, dl))), VIEM_PAY_DIGEST);

        vm.warp(dl - 1 minutes);
        vm.deal(account, amount);
        vm.startPrank(account);
        arcPay.linkHuman(human, dl, _sign(APPROVER_PK, VIEM_LINK_DIGEST));
        arcPay.raiseCap(100e18, dl, _sign(APPROVER_PK, VIEM_CAP_DIGEST));
        arcPay.payWithApproval{value: amount}(to, hash, "WhatsApp", dl, _sign(APPROVER_PK, VIEM_PAY_DIGEST));
        vm.stopPrank();
        assertEq(to.balance, amount);
    }
}
