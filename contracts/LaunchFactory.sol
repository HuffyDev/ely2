// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FixedToken} from "./FixedToken.sol";
import {FeeRules} from "./FeeRules.sol";
import {LaunchFeeHook} from "./LaunchFeeHook.sol";

/// @notice Candidate factory for isolated simulations. The attester is fixed at construction.
contract LaunchFactory {
    IPoolManager public immutable manager;
    address public immutable attester;
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint256 public constant MIN_HYPE = 0.1 ether;
    uint256 public constant MAX_CREATOR = SUPPLY / 10;
    mapping(address => address) public hookOf;
    bool private entered;

    struct Launch {
        string name;
        string symbol;
        bytes32 tokenSalt;
        bytes32 hookSalt;
        uint128 liquidity;
        int24 initialTick;
        uint256 creatorAllocation;
        FeeRules.Spec rules;
    }

    event Launched(address indexed creator, address indexed token, address indexed hook, bytes32 reportHash,
        uint256 creatorAllocation, uint256 hypeSeed, uint256 tokenSeed, uint256 lockedTokenRemainder);
    error InvalidLaunch();
    error InvalidSwap();
    error Unauthorized();

    constructor(IPoolManager manager_, address attester_) {
        if (address(manager_).code.length == 0 || attester_ == address(0)) revert InvalidLaunch();
        manager = manager_;
        attester = attester_;
    }

    modifier guarded() {
        if (entered) revert Unauthorized();
        entered = true;
        _;
        entered = false;
    }

    function approvalHash(Launch calldata p, address creator, uint256 funding, bytes32 reportHash, uint256 expiry)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), address(manager), creator, funding, p, reportHash, expiry));
    }

    function launch(Launch calldata p, bytes32 reportHash, uint256 expiry, uint8 v, bytes32 r, bytes32 s)
        external payable guarded returns (address token, address hook)
    {
        if (reportHash == 0 || expiry < block.timestamp || msg.value < MIN_HYPE ||
            p.creatorAllocation > MAX_CREATOR || p.liquidity == 0 ||
            p.initialTick <= -887220 || p.initialTick >= 887220) revert InvalidLaunch();
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", approvalHash(p, msg.sender, msg.value, reportHash, expiry)));
        if (ecrecover(digest, v, r, s) != attester) revert Unauthorized();

        bytes32 salt = keccak256(abi.encode(msg.sender, p.tokenSalt));
        FixedToken coin = new FixedToken{salt: salt}(p.name, p.symbol, SUPPLY);
        token = address(coin);
        hook = address(new LaunchFeeHook{salt: p.hookSalt}(manager, token, p.rules, msg.sender, address(this)));
        hookOf[token] = hook;

        PoolKey memory key = poolKey(token, hook);
        manager.initialize(key, TickMath.getSqrtPriceAtTick(p.initialTick));
        (uint256 hypeSeed, uint256 tokenSeed) = abi.decode(
            manager.unlock(abi.encode(true, key, msg.sender, uint256(p.liquidity), uint256(0), false)),
            (uint256, uint256)
        );
        if (hypeSeed < MIN_HYPE || tokenSeed == 0 || tokenSeed > SUPPLY - p.creatorAllocation) revert InvalidLaunch();
        coin.transfer(msg.sender, p.creatorAllocation);
        emit Launched(msg.sender, token, hook, reportHash, p.creatorAllocation, hypeSeed, tokenSeed, SUPPLY - p.creatorAllocation - tokenSeed);
        payNative(msg.sender, msg.value - hypeSeed);
    }

    /// @notice Exact-input swap with authenticated payer, minimum output, and expiry.
    function swap(address token, bool buy, uint128 amount, uint128 minOut, uint256 expiry)
        external payable guarded returns (uint256 output)
    {
        address hook = hookOf[token];
        if (hook == address(0) || expiry < block.timestamp || minOut == 0 || amount == 0 ||
            msg.value != (buy ? amount : 0)) revert InvalidSwap();
        (uint256 spent, uint256 received) = abi.decode(
            manager.unlock(abi.encode(false, poolKey(token, hook), msg.sender, uint256(amount), uint256(minOut), buy)),
            (uint256, uint256)
        );
        if (buy) payNative(msg.sender, msg.value - spent);
        return received;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager) || !entered) revert Unauthorized();
        (bool seed, PoolKey memory key, address payer, uint256 amount, uint256 minOut, bool buy) =
            abi.decode(data, (bool, PoolKey, address, uint256, uint256, bool));
        FixedToken coin = FixedToken(Currency.unwrap(key.currency1));
        if (seed) {
            (BalanceDelta delta,) = manager.modifyLiquidity(key, ModifyLiquidityParams(-887220, 887220, int256(amount), 0), "");
            uint256 hype = uint256(-int256(delta.amount0()));
            uint256 tokens = uint256(-int256(delta.amount1()));
            settle(coin, address(this), hype, tokens);
            return abi.encode(hype, tokens);
        }
        BalanceDelta trade = manager.swap(key, SwapParams(buy, -int256(amount),
            buy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), abi.encode(payer));
        uint256 spent = uint256(-int256(buy ? trade.amount0() : trade.amount1()));
        int128 received = buy ? trade.amount1() : trade.amount0();
        if (received <= 0 || uint128(received) < minOut || spent != amount) revert InvalidSwap();
        settle(coin, payer, buy ? spent : 0, buy ? 0 : spent);
        manager.take(buy ? key.currency1 : key.currency0, payer, uint128(received));
        return abi.encode(spent, uint128(received));
    }

    function settle(FixedToken coin, address payer, uint256 hype, uint256 tokens) private {
        if (hype != 0) manager.settle{value: hype}();
        if (tokens != 0) {
            manager.sync(Currency.wrap(address(coin)));
            if (payer == address(this)) coin.transfer(address(manager), tokens);
            else coin.transferFrom(payer, address(manager), tokens);
            manager.settle();
        }
    }

    function poolKey(address token, address hook) private pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(address(0)), Currency.wrap(token), 0x800000, 60, IHooks(hook));
    }

    function payNative(address recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert InvalidLaunch();
    }
}
