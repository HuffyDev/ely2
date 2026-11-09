// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

contract FixedToken is ERC20 {
    address public immutable creator;
    uint256 public lastCreatorTransfer;

    constructor(string memory name_, string memory symbol_, uint256 supply, address creator_)
        ERC20(name_, symbol_, 18)
    {
        creator = creator_;
        _mint(msg.sender, supply);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool success = super.transfer(to, amount);
        record(msg.sender, to, amount);
        return success;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool success = super.transferFrom(from, to, amount);
        record(from, to, amount);
        return success;
    }

    function record(address from, address to, uint256 amount) private {
        // Zero amounts and self-transfers do not move tokens out of the wallet.
        if (from == creator && to != from && amount != 0) lastCreatorTransfer = block.timestamp;
    }
}
