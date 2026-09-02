import { expect } from "chai";
import hre from "hardhat";
import { parseUnits, getAddress } from "viem";

async function setup() {
  const [collector, ada, emeka, school] = await hre.viem.getWalletClients();
  const token = await hre.viem.deployContract("MockERC20", ["Mock USDT", "USDT", 6]);
  const earmark = await hre.viem.deployContract("Earmark", []);
  for (const w of [ada, emeka]) {
    await token.write.mint([w.account.address, parseUnits("1000", 6)]);
  }
  return { collector, ada, emeka, school, token, earmark };
}

describe("Earmark", () => {
  it("routes contributions straight to the locked destination and closes at target", async () => {
    const { collector, ada, emeka, school, token, earmark } = await setup();
    const target = parseUnits("100", 6);
    await earmark.write.createDrive(
      [token.address, school.account.address, target, 0n, "Term 1 fees - Chioma"],
      { account: collector.account },
    );
    const d0 = await earmark.read.drive([1n]);
    expect(getAddress(d0.destination)).to.equal(getAddress(school.account.address));

    await token.write.approve([earmark.address, target], { account: ada.account });
    await earmark.write.contribute([1n, parseUnits("60", 6), "Ada"], { account: ada.account });
    expect(await token.read.balanceOf([school.account.address])).to.equal(parseUnits("60", 6));
    expect(await token.read.balanceOf([earmark.address])).to.equal(0n);

    await token.write.approve([earmark.address, target], { account: emeka.account });
    await expect(
      earmark.write.contribute([1n, parseUnits("50", 6), "Emeka"], { account: emeka.account }),
    ).to.be.rejectedWith("OverTarget");

    await earmark.write.contribute([1n, parseUnits("40", 6), "Emeka"], { account: emeka.account });
    const d1 = await earmark.read.drive([1n]);
    expect(d1.raised).to.equal(target);
    expect(d1.closed).to.equal(true);
    expect(await token.read.balanceOf([school.account.address])).to.equal(target);
    expect(await earmark.read.contributionOf([1n, ada.account.address])).to.equal(parseUnits("60", 6));
  });

  it("only the collector can close, and closed drives reject contributions", async () => {
    const { collector, ada, school, token, earmark } = await setup();
    await earmark.write.createDrive([token.address, school.account.address, 0n, 0n, "House light"], {
      account: collector.account,
    });
    await expect(earmark.write.close([1n], { account: ada.account })).to.be.rejectedWith("NotCollector");
    await earmark.write.close([1n], { account: collector.account });
    await token.write.approve([earmark.address, 1n], { account: ada.account });
    await expect(earmark.write.contribute([1n, 1n, "Ada"], { account: ada.account })).to.be.rejectedWith(
      "DriveClosedError",
    );
  });

  it("rejects contributions after the deadline", async () => {
    const { collector, ada, school, token, earmark } = await setup();
    const past = BigInt(Math.floor(Date.now() / 1000) - 3600);
    await earmark.write.createDrive([token.address, school.account.address, 0n, past, "Late"], {
      account: collector.account,
    });
    await token.write.approve([earmark.address, 1n], { account: ada.account });
    await expect(earmark.write.contribute([1n, 1n, "Ada"], { account: ada.account })).to.be.rejectedWith(
      "PastDeadline",
    );
  });
});
