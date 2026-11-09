// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FeeRules} from "../contracts/FeeRules.sol";

contract FeeRulesTest {
    function testFuzz_FeeBound(uint16 a, uint16 b, uint16 c, uint16 d, uint32 seconds_, uint256 elapsed) public pure {
        FeeRules.Spec memory spec = FeeRules.Spec(a % 501, b % 501, c % 501, d % 501, seconds_ % 86400 + 1, 0, 0);
        FeeRules.validate(spec);
        bool opening = elapsed < spec.windowSeconds;
        assert(FeeRules.fee(spec, true, elapsed) == uint24(opening ? spec.openingSellBps : spec.sellBps) * 100);
        assert(FeeRules.fee(spec, false, elapsed) <= 50_000);
        assert(FeeRules.fee(spec, true, elapsed) <= 50_000);
    }

    function test_OpeningBoundary() public pure {
        FeeRules.Spec memory spec = FeeRules.Spec(30, 50, 100, 200, 600, 0, 0);
        assert(FeeRules.fee(spec, true, 599) == 20_000);
        assert(FeeRules.fee(spec, true, 600) == 5_000);
    }
}
