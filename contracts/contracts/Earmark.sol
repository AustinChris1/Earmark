// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Routes every contribution straight to the drive's locked destination; the contract never holds funds.
contract Earmark {
    using SafeERC20 for IERC20;

    struct Drive {
        address token;
        address destination;
        address collector;
        uint256 target;
        uint256 raised;
        uint64 deadline;
        bool closed;
        string label;
    }

    uint256 public driveCount;
    mapping(uint256 => Drive) private _drives;
    mapping(uint256 => mapping(address => uint256)) public contributionOf;

    event DriveCreated(
        uint256 indexed id,
        address indexed collector,
        address indexed destination,
        address token,
        uint256 target,
        uint64 deadline,
        string label
    );
    event Contributed(uint256 indexed id, address indexed payer, uint256 amount, uint256 raised, string memo);
    event DriveClosed(uint256 indexed id, uint256 raised);

    error ZeroAddress();
    error DriveClosedError();
    error PastDeadline();
    error OverTarget();
    error NotCollector();
    error ZeroAmount();

    function createDrive(
        address token,
        address destination,
        uint256 target,
        uint64 deadline,
        string calldata label
    ) external returns (uint256 id) {
        if (token == address(0) || destination == address(0)) revert ZeroAddress();
        id = ++driveCount;
        _drives[id] = Drive({
            token: token,
            destination: destination,
            collector: msg.sender,
            target: target,
            raised: 0,
            deadline: deadline,
            closed: false,
            label: label
        });
        emit DriveCreated(id, msg.sender, destination, token, target, deadline, label);
    }

    /// Pulls `amount` from the payer and forwards it to the destination in the same call.
    function contribute(uint256 id, uint256 amount, string calldata memo) external {
        Drive storage d = _drives[id];
        if (d.destination == address(0)) revert ZeroAddress();
        if (d.closed) revert DriveClosedError();
        if (d.deadline != 0 && block.timestamp > d.deadline) revert PastDeadline();
        if (amount == 0) revert ZeroAmount();
        if (d.target != 0 && d.raised + amount > d.target) revert OverTarget();

        d.raised += amount;
        contributionOf[id][msg.sender] += amount;
        IERC20(d.token).safeTransferFrom(msg.sender, d.destination, amount);

        emit Contributed(id, msg.sender, amount, d.raised, memo);
        if (d.target != 0 && d.raised == d.target) {
            d.closed = true;
            emit DriveClosed(id, d.raised);
        }
    }

    function close(uint256 id) external {
        Drive storage d = _drives[id];
        if (msg.sender != d.collector) revert NotCollector();
        if (d.closed) revert DriveClosedError();
        d.closed = true;
        emit DriveClosed(id, d.raised);
    }

    function drive(uint256 id) external view returns (Drive memory) {
        return _drives[id];
    }
}
