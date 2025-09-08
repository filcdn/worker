import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { ContractUpgraded } from "../generated/schema"
import { ContractUpgraded as ContractUpgradedEvent } from "../generated/PDPVerifier/PDPVerifier"
import { handleContractUpgraded } from "../src/pdp-verifier"
import { createContractUpgradedEvent } from "./pdp-verifier-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let version = "Example string value"
    let implementation = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let newContractUpgradedEvent = createContractUpgradedEvent(
      version,
      implementation
    )
    handleContractUpgraded(newContractUpgradedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("ContractUpgraded created and stored", () => {
    assert.entityCount("ContractUpgraded", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "ContractUpgraded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "version",
      "Example string value"
    )
    assert.fieldEquals(
      "ContractUpgraded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "implementation",
      "0x0000000000000000000000000000000000000001"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
