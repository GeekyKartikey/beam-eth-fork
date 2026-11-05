// SPDX-License-Identifier: MIT
// Deploys BeamPay. See contracts/README.md for the Arc command.
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BeamPay} from "../src/BeamPay.sol";

/// @notice Deploys BeamPay with the approver from `APPROVER_ADDRESS` and the cap from `DEFAULT_CAP_WEI`.
contract DeployBeamPay is Script {
    /// @dev Arc testnet chain ID (native USDC, 18 decimals).
    uint256 private constant ARC_TESTNET = 5042002;

    /// @notice Deploys BeamPay and logs its address.
    /// @return beamPay The deployed contract.
    function run() external returns (BeamPay beamPay) {
        address approver = vm.envAddress("APPROVER_ADDRESS");
        uint256 defaultCap =
            vm.envExists("DEFAULT_CAP_WEI") ? vm.envUint("DEFAULT_CAP_WEI") : defaultCapFor(block.chainid);
        vm.startBroadcast();
        beamPay = new BeamPay(approver, defaultCap);
        vm.stopBroadcast();
        console.log("BeamPay deployed at", address(beamPay));
        console.log("chainId", block.chainid);
        console.log("approver", approver);
        console.log("defaultCap (wei)", defaultCap);
    }

    /// @dev Default per-payment cap for a chain: 25 USDC on Arc.
    /// @param chainId Target chain ID.
    /// @return Cap in wei; reverts on other chains so the cap is never guessed.
    function defaultCapFor(uint256 chainId) private pure returns (uint256) {
        if (chainId == ARC_TESTNET) return 25e18;
        revert("DeployBeamPay: set DEFAULT_CAP_WEI for this chain");
    }
}
