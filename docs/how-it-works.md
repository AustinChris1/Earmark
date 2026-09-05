# How Earmark works

## In one paragraph

Someone opens a drive: an amount, a token, a destination address and a name for what
it is. The destination is written into a smart contract at that moment. Everyone else
pays their share through a link. Each payment moves from the payer straight to the
destination inside a single transaction, so the money is never held by Earmark, by the
contract, or by the person who opened the drive. The chat sees who has paid and who
has not, and the chain holds the receipt.

## Why the destination lock is the whole product

Most group payment tools pool money and then release it. That creates a moment where
somebody holds everyone else's money, which is exactly the moment things go wrong.

Earmark has no such moment. The contract function is short enough to read in full:

```solidity
function contribute(uint256 id, uint256 amount, string memo) external {
    Drive storage d = _drives[id];
    ...
    d.raised += amount;
    contributionOf[id][msg.sender] += amount;
    IERC20(d.token).safeTransferFrom(msg.sender, d.destination, amount);
    emit Contributed(id, msg.sender, amount, d.raised, memo);
}
```

The transfer is `payer -> destination`. The contract is a router, not a vault. Its
token balance is asserted to be exactly zero in the test suite. There is no withdraw
function to call and no owner to compromise, so "we cannot run away with your money"
is a property of the code rather than a promise in a document.

## Paying over time

A one off collection gives a group no reason to come back, and most real obligations
are not one off. A collector can split each person's share into instalments on a
cadence: daily, weekly, fortnightly or monthly.

The agent then nudges each person in the chat when theirs falls due, at most once per
person per drive per twenty hours. Someone who pays their whole share early is never
chased for an instalment that has not arrived yet.

Instalment status is never stored as a flag that could drift. It is recomputed from
the payment history every time it is read, so a retry, a duplicate log or a restart
cannot leave the ledger wrong.

## Proof of personhood

A drive names where money must land, so the risk worth defending against is somebody
publishing a fake school or a fake landlord. Before opening a drive, a collector
verifies once with [Self](https://self.xyz): a government document is read on their own
device, and Self mints a non transferable token to their wallet on Celo. Earmark never
sees the document. It only reads whether that wallet holds the token.

Binding a Telegram account to a wallet requires signing a message, so a verified
address cannot simply be typed in by somebody else.

## Paying from outside the chat

A relative abroad does not need Telegram or the group. Two routes exist:

- the drive's public page, which anybody with the link can pay from a wallet
- an x402 endpoint, so another agent can pay a share programmatically, settling in
  USDC, USDT or USAT through Celo's facilitator

## What each participant sees

| Who | What they do | What they never do |
|---|---|---|
| Collector | Names the obligation and the destination, sets shares | Hold anyone's money, or change the destination |
| Payer | Pays their share or instalment from their own wallet | Send money to a person and hope |
| Earmark agent | Announces, nudges, keeps the tally, forwards x402 payments | Take custody on the group chat path |

The one exception worth naming: on the x402 route the agent briefly receives the
payment before forwarding it to the locked destination, because the settlement is made
to the agent's address. The group chat path never touches it.
