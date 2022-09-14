const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const vault = await contractAt("Vault", "0x35A98e23c769698BdC30aC23aD4A25232d33493B")
  const usdg = await contractAt("USDG", "0xE16B4A516472b7fA17ee465c8203C7F2B89b3955")
  const glp = await contractAt("GLP", "0x57c2687a344E334511263996B7a310F31DDB9C9b")

  const glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, 15 * 60])

  await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")

  await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
  await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault")
  await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")

  writeTmpAddresses({
    glpManager: glpManager.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
