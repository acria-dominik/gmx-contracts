const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const vault = await contractAt("Vault", "0x35A98e23c769698BdC30aC23aD4A25232d33493B")
  const tokenManager = { address: "0x141B3C911b9a3CEEc2a62bb8C304514011a8fdC4" }
  const mintReceiver = { address: "0x50F22389C10FcC3bA9B1AB9BCDafE40448a357FB" }

  const positionRouter = { address: "0x1c24f4309a4e0A5458B571Bf9Df7632Ebf13d2bB" }
  const positionManager = { address: "0xB4aFA322a959AdA1218a8bf260cA9aD4A3b02AFF" }

  return { vault, tokenManager, mintReceiver, positionRouter, positionManager }
}

async function getAvaxValues() {
  const vault = await contractAt("Vault", "0x9ab2De34A33fB459b538c43f251eB825645e8595")
  const tokenManager = { address: "0x26137dfA81f9Ac8BACd748f6A298262f11504Da9" }
  const mintReceiver = { address: "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653" }

  const positionRouter = { address: "0x195256074192170d1530527abC9943759c7167d8" }
  const positionManager = { address: "0xF2ec2e52c3b5F8b8bd5A3f93945d05628A233216" }

  return { vault, tokenManager, mintReceiver, positionRouter, positionManager }
}

async function getValues() {
  if (network === "avax") {
    return getAvaxValues()
  }

  return getArbValues()
}

async function main() {
  const signer = await getFrameSigner()

  const admin = "0xA02efD9C3C9191eA7daB058213d0adDEc47f41c6"
  const buffer = 24 * 60 * 60
  const rewardManager = { address: ethers.constants.AddressZero }
  const maxTokenSupply = expandDecimals("13250000", 18)

  const { vault, tokenManager, mintReceiver, positionRouter, positionManager } = await getValues()

  const timelock = await deployContract("Timelock", [
    admin,
    buffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply,
    10, // marginFeeBasisPoints 0.1%
    100 // maxMarginFeeBasisPoints 1%
  ], "Timelock")
  // const timelock = await contractAt("Timelock", "0xA3231cf5C742DfD681D2Ee9d8a732D4c151946Ab")

  const deployedTimelock = await contractAt("Timelock", timelock.address)

  // await sendTxn(deployedTimelock.setShouldToggleIsLeverageEnabled(true), "deployedTimelock.setShouldToggleIsLeverageEnabled(true)")
  // await sendTxn(deployedTimelock.setContractHandler(positionRouter.address, true), "deployedTimelock.setContractHandler(positionRouter)")
  // await sendTxn(deployedTimelock.setContractHandler(positionManager.address, true), "deployedTimelock.setContractHandler(positionManager)")

  // // update gov of vault, vaultPriceFeed, fastPriceFeed
  const vaultGov = await contractAt("Timelock", timelock.address)
  const vaultPriceFeed = await contractAt("VaultPriceFeed", await vault.priceFeed())
  const vaultPriceFeedGov = await contractAt("Timelock", timelock.address)
  const fastPriceFeed = await contractAt("FastPriceFeed", await vaultPriceFeed.secondaryPriceFeed())
  const fastPriceFeedGov = await contractAt("Timelock", timelock.address)

  await sendTxn(vaultGov.signalSetGov(vault.address, deployedTimelock.address), "vaultGov.signalSetGov")
  await sendTxn(vaultPriceFeedGov.signalSetGov(vaultPriceFeed.address, deployedTimelock.address), "vaultPriceFeedGov.signalSetGov")
  await sendTxn(fastPriceFeedGov.signalSetGov(fastPriceFeed.address, deployedTimelock.address), "fastPriceFeedGov.signalSetGov")

  await sendTxn(deployedTimelock.signalSetGov(vault.address, vaultGov.address), "deployedTimelock.signalSetGov(vault)")
  await sendTxn(deployedTimelock.signalSetGov(vaultPriceFeed.address, vaultPriceFeedGov.address), "deployedTimelock.signalSetGov(vaultPriceFeed)")
  await sendTxn(deployedTimelock.signalSetGov(fastPriceFeed.address, fastPriceFeedGov.address), "deployedTimelock.signalSetGov(fastPriceFeed)")

  const signers = [
    "0x82429089e7c86B7047b793A9E7E7311C93d2b7a6", // coinflipcanada
    "0xD7941C4Ca57a511F21853Bbc7FBF8149d5eCb398", // G
    "0xfb481D70f8d987c1AE3ADc90B7046e39eb6Ad64B", // kr
    "0x99Aa3D1b3259039E8cB4f0B33d0Cfd736e1Bf49E", // quat
    "0x6091646D0354b03DD1e9697D33A7341d8C93a6F5", // xhiroz
    "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" // X
  ]

  for (let i = 0; i < signers.length; i++) {
    const signer = signers[i]
    await sendTxn(deployedTimelock.setContractHandler(signer, true), `deployedTimelock.setContractHandler(${signer})`)
  }

  const watchers = signers.concat([
    "0x45e48668F090a3eD1C7961421c60Df4E66f693BD", // Dovey
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
    "0x2e5d207a4c0f7e7c52f6622dcc6eb44bc0fe1a13" // Krunal Amin
  ])

  for (let i = 0; i < watchers.length; i++) {
    const watcher = watchers[i]
    await sendTxn(deployedTimelock.signalSetPriceFeedWatcher(fastPriceFeed.address, watcher, true), `deployedTimelock.signalSetPriceFeedWatcher(${watcher})`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
