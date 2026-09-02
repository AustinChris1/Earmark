import hre from "hardhat";
import { parseUnits } from "viem";

// Deploys Earmark plus a 6 decimal test token on the local node and opens two drives with real payments.
async function main() {
  const [collector, ada, emeka, chidi, school, landlord] = await hre.viem.getWalletClients();
  const token = await hre.viem.deployContract("MockERC20", ["Test USDT", "tUSDT", 6]);
  const earmark = await hre.viem.deployContract("Earmark", []);

  for (const w of [ada, emeka, chidi]) {
    await token.write.mint([w.account.address, parseUnits("5000", 6)]);
    await token.write.approve([earmark.address, parseUnits("5000", 6)], { account: w.account });
  }

  await earmark.write.createDrive(
    [token.address, school.account.address, parseUnits("450", 6), 0n, "Term 1 fees for Chioma"],
    { account: collector.account },
  );
  await earmark.write.contribute([1n, parseUnits("150", 6), "tg:1001:@ada"], { account: ada.account });
  await earmark.write.contribute([1n, parseUnits("120", 6), "tg:1002:@emeka"], { account: emeka.account });

  await earmark.write.createDrive(
    [token.address, landlord.account.address, parseUnits("300", 6), 0n, "September rent, flat 3"],
    { account: collector.account },
  );
  await earmark.write.contribute([2n, parseUnits("100", 6), "tg:1003:@chidi"], { account: chidi.account });

  console.log(`EARMARK_ADDRESS=${earmark.address}`);
  console.log(`TEST_TOKEN=${token.address}`);
  console.log(`school=${school.account.address}  landlord=${landlord.account.address}`);
  console.log(`drives: 1 (fees, 270/450 paid), 2 (rent, 100/300 paid)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
