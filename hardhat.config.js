import { defineConfig } from 'hardhat/config'
import * as dotenv from 'dotenv'
dotenv.config()

const PK  = process.env.PRIVATE_KEY
  ? (process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : '0x' + process.env.PRIVATE_KEY)
  : '0x0000000000000000000000000000000000000000000000000000000000000001'
const RPC = process.env.SEPOLIA_RPC_URL ?? ''

export default defineConfig({
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      type:     'http',
      url:      RPC || 'https://rpc.sepolia.org',
      chainId:  11155111,
      accounts: RPC ? [PK] : [],
    },
    localhost: {
      type:    'http',
      url:     'http://127.0.0.1:8545',
      chainId: 31337,
    },
  },
  paths: {
    sources:   './contracts',
    tests:     './test',
    cache:     './cache',
    artifacts: './artifacts',
  },
})
