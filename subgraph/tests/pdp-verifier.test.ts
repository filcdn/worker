import { BigInt, Bytes } from '@graphprotocol/graph-ts'
import {
  assert,
  beforeEach,
  clearStore,
  describe,
  logStore,
  test,
} from 'matchstick-as/assembly/index'
import {
  getEventEntityId,
  handlePiecesAdded,
  handlePiecesRemoved,
} from '../src/pdp-verifier'
import {
  createPiecesAddedEvent,
  createPiecesRemovedEvent,
} from './pdp-verifier-utils'

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure
// For more test scenarios, see:
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test
// More assert options:
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts

describe('FilBeam Subgraph', () => {
  beforeEach(() => {
    clearStore()
  })

  test('PiecesAdded created and stored', () => {
    assert.entityCount('PiecesAdded', 0)

    const event = createPiecesAddedEvent(
      BigInt.fromString('102'),
      [
        // Piece IDs
        BigInt.fromString('9001'),
        BigInt.fromString('9002'),
      ],
      [
        // Piece CIDs
        Bytes.fromHexString(
          '0x01559120225a03b9ee2f06796d442590e54a4c8a0ac87c2eea0f443a3ca2b87644e1273956e41b',
        ),
        Bytes.fromHexString(
          '0x0155912022790365ec97934801b1466f14f3c6e7b396c11d4cab75c94fea0fdaa4ac0bce5a7710',
        ),
      ],
    )

    handlePiecesAdded(event)

    logStore()

    assert.entityCount('PiecesAdded', 1)
    const id = getEventEntityId(event).toHexString()

    assert.fieldEquals('PiecesAdded', id, 'setId', '102')
    assert.fieldEquals('PiecesAdded', id, 'pieceIds', '[9001, 9002]')
    assert.fieldEquals(
      'PiecesAdded',
      id,
      'pieceCids',
      '[0x01559120225a03b9ee2f06796d442590e54a4c8a0ac87c2eea0f443a3ca2b87644e1273956e41b, 0x0155912022790365ec97934801b1466f14f3c6e7b396c11d4cab75c94fea0fdaa4ac0bce5a7710]',
    )
  })

  test('PiecesRemoved created and stored', () => {
    assert.entityCount('PiecesRemoved', 0)

    const event = createPiecesRemovedEvent(BigInt.fromString('103'), [
      // Piece IDs
      BigInt.fromString('9003'),
      BigInt.fromString('9004'),
    ])

    handlePiecesRemoved(event)

    logStore()

    assert.entityCount('PiecesRemoved', 1)
    const id = getEventEntityId(event).toHexString()

    assert.fieldEquals('PiecesRemoved', id, 'setId', '103')
    assert.fieldEquals('PiecesRemoved', id, 'pieceIds', '[9003, 9004]')
  })
})
