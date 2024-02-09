import { verifyADR36Amino } from '@keplr-wallet/cosmos';
import axiosApi from 'axios';
import { Balance, UintRange, convertBalance, convertUintRange } from 'bitbadgesjs-sdk';
import { BigIntify, GetBadgeBalanceByAddressRoute, GetBadgeBalanceByAddressRouteSuccessResponse, NumberType, OffChainBalancesMap, Stringify, SupportedChain, convertToCosmosAddress, getBalancesForIds, getChainForAddress } from 'bitbadgesjs-sdk';
import { CreateAssetParams, IChainDriver, constructChallengeObjectFromString } from 'blockin';
import { AndGroup, AssetConditionGroup, OrGroup, OwnershipRequirements } from 'blockin/dist/types/verify.types';
import { Buffer } from 'buffer';

export const axios = axiosApi.create({
  withCredentials: true,
  headers: {
    "Content-type": "application/json",
  },
});

/**
 * Cosmos implementation of the IChainDriver interface.
 *
 * For documentation regarding what each function does, see the IChainDriver interface.
 *
 * Note that the Blockin library also has many convenient, chain-generic functions that implement
 * this logic for creating / verifying challenges. Before using, you will have to setChainDriver(new CosmosDriver(.....)) first.
 */
export default class CosmosDriver implements IChainDriver<NumberType> {
  chain;
  constructor(chain: string) {
    this.chain = chain;
  }

  isValidAddress(address: string) {
    return getChainForAddress(address) === SupportedChain.COSMOS;
  }

  /**Not implemented */
  getPublicKeyFromAddress(address: string) {
    throw 'Not implemented';
    return new Uint8Array(0);
  }
  async verifySignature(message: string, signature: string, publicKey?: string) {
    if (!publicKey) {
      throw `Public key is required for Cosmos verification`;
    }

    const originalString = message;
    const originalAddress = constructChallengeObjectFromString(message, Stringify).address;

    const signatureBuffer = Buffer.from(signature, 'base64');
    const uint8Signature = new Uint8Array(signatureBuffer); // Convert the buffer to an Uint8Array

    const pubKeyValueBuffer = Buffer.from(publicKey, 'base64'); // Decode the base64 encoded value
    const pubKeyUint8Array = new Uint8Array(pubKeyValueBuffer); // Convert the buffer to an Uint8Array

    //concat the two Uint8Arrays //This is probably legacy code and can be removed
    const signedChallenge = new Uint8Array(pubKeyUint8Array.length + uint8Signature.length);
    signedChallenge.set(pubKeyUint8Array);
    signedChallenge.set(uint8Signature, pubKeyUint8Array.length);

    const pubKeyBytes = signedChallenge.slice(0, 33);
    const signatureBytes = signedChallenge.slice(33);

    const prefix = 'cosmos'; // change prefix for other chains...

    const isRecovered = verifyADR36Amino(
      prefix,
      originalAddress,
      originalString,
      pubKeyBytes,
      signatureBytes,
      'secp256k1'
    );

    if (!isRecovered) {
      throw `Signature invalid for address ${originalAddress}`;
    }
  }

  async verifyAssets(address: string, resources: string[], _assets: AssetConditionGroup<NumberType> | undefined, balancesSnapshot?: object): Promise<any> {
    if (!_assets) return //if no asset requirements, we do not need to verify anything

    const andItem: AndGroup<bigint> = _assets as AndGroup<bigint>
    const orItem: OrGroup<bigint> = _assets as OrGroup<bigint>
    const normalItem: OwnershipRequirements<bigint> = _assets as OwnershipRequirements<bigint>

    if (andItem.$and) {
      for (const item of andItem.$and) {
        await this.verifyAssets(address, resources, item, balancesSnapshot)
      }
    } else if (orItem.$or) {
      for (const item of orItem.$or) {
        try {
          await this.verifyAssets(address, resources, item, balancesSnapshot)
          return  //if we get here, we are good (short circuit)
        } catch (e) {
          continue
        }
      }

      throw new Error(`Did not meet the requirements for any of the assets in the group`)
    } else {
      const numToSatisfy = normalItem.options?.numMatchesForVerification ?? 0;
      const mustSatisfyAll = !numToSatisfy;

      let numSatisfied = 0;
      for (const asset of normalItem.assets) {


        let docBalances: Balance<bigint>[] = []
        let balances: Balance<bigint>[] = [];

        if (asset.chain === 'BitBadges') {
          if (!balancesSnapshot) {
            const balancesRes: GetBadgeBalanceByAddressRouteSuccessResponse<string> = await axios.post(
              "https://api.bitbadges.io" +
              GetBadgeBalanceByAddressRoute(asset.collectionId, convertToCosmosAddress(address),),
              {},
              {
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": process.env.BITBADGES_API_KEY,
                },
              },
            ).then((res) => {
              return res.data
            })

            docBalances = balancesRes.balance.balances.map((x) => convertBalance(x, BigIntify))
          } else {
            const cosmosAddress = convertToCosmosAddress(address)
            const balancesSnapshotObj = balancesSnapshot as OffChainBalancesMap<bigint>
            docBalances = balancesSnapshotObj[cosmosAddress] ? balancesSnapshotObj[cosmosAddress].map(x => convertBalance(x, BigIntify)) : []
          }


          if (asset.collectionId === 'BitBadges Lists') {
            throw new Error(`BitBadges Lists are not supported for now`)
          } else {
            if (
              !asset.assetIds.every(
                (x) => typeof x === "object" && BigInt(x.start) >= 0 && BigInt(x.end) >= 0,
              )
            ) {
              throw new Error(`All assetIds must be UintRanges for BitBadges compatibility`)
            }
          }

          if (
            asset.ownershipTimes &&
            !asset.ownershipTimes.every(
              (x) => typeof x === "object" && BigInt(x.start) >= 0 && BigInt(x.end) >= 0,
            )
          ) {
            throw new Error(`All ownershipTimes must be UintRanges for BitBadges compatibility`)
          }

          if (
            asset.mustOwnAmounts && !(typeof asset.mustOwnAmounts === "object" && BigInt(asset.mustOwnAmounts.start) >= 0 && BigInt(asset.mustOwnAmounts.end) >= 0)
          ) {
            throw new Error(`mustOwnAmount must be UintRange for BitBadges compatibility`)
          }

          if (!asset.ownershipTimes || asset.ownershipTimes.length === 0) {
            asset.ownershipTimes = [{ start: BigInt(Date.now()), end: BigInt(Date.now()) }]
          }

          balances = getBalancesForIds(
            asset.assetIds.map((x) => convertUintRange(x as UintRange<bigint>, BigIntify)),
            asset.ownershipTimes.map((x) => convertUintRange(x, BigIntify)),
            docBalances,
          )

        } else {
          //TODO: Add Cosmos asset verification

          throw new Error(`Cosmos asset verification is not supported for now`)
        }

        const mustOwnAmount = asset.mustOwnAmounts

        for (const balance of balances) {
          if (balance.amount < mustOwnAmount.start) {
            if (mustSatisfyAll) {
              if (asset.collectionId === 'BitBadges Lists') {
                const listIdIdx = balance.badgeIds[0].start - 1n;
                const correspondingListId = asset.assetIds[Number(listIdIdx)]
                throw new Error(
                  `Address ${address} does not meet the requirements for list ${correspondingListId}`,
                )
              } else {
                throw new Error(
                  `Address ${address} does not own enough of IDs ${balance.badgeIds
                    .map((x) => `${x.start}-${x.end}`)
                    .join(",")} from collection ${asset.collectionId
                  } to meet minimum balance requirement of ${mustOwnAmount.start}`,
                )
              }
            } else {
              continue
            }
          }

          if (balance.amount > mustOwnAmount.end) {
            if (mustSatisfyAll) {
              if (asset.collectionId === 'BitBadges Lists') {
                const listIdIdx = balance.badgeIds[0].start - 1n;
                const correspondingListId = asset.assetIds[Number(listIdIdx)]
                throw new Error(
                  `Address ${address} does not meet requirements for list ${correspondingListId}`,
                )
              }
              else {
                throw new Error(
                  `Address ${address} owns too much of IDs ${balance.badgeIds
                    .map((x) => `${x.start}-${x.end}`)
                    .join(",")} from collection ${asset.collectionId
                  } to meet maximum balance requirement of ${mustOwnAmount.end}`,
                )
              }
            } else {
              continue
            }
          }

          numSatisfied++;
        }
      }

      if (mustSatisfyAll) {
        //we made it through all balances and didn't throw an error so we are good
      } else if (numSatisfied < numToSatisfy) {
        throw new Error(
          `Address ${address} did not meet the ownership requirements for at least ${numToSatisfy} of the IDs. Met for ${numSatisfied} of the IDs.`,
        )
      }
    }

  }
}
