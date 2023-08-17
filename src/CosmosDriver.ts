import { verifyADR36Amino } from '@keplr-wallet/cosmos';
import { SupportedChain, getChainForAddress } from 'bitbadgesjs-utils';
import { Buffer } from 'buffer';
import { CreateAssetParams, CreateTransferAssetParams, IChainDriver, UniversalTxn } from 'blockin';

type CreateContractOptInParams = {
  from: string,
  appIndex: number,
  extras?: any
}

type CreateContractNoOpParams = {
  from: string,
  appIndex: number,
  appArgs: Uint8Array[] | undefined,
  accounts: string[] | undefined,
  foreignAssets: number[] | undefined
}

/**
* Universal type for any chain's opt-in to asset transaction parameters. 
*/
type CreateOptInAssetParams = {
  to: string,
  from?: string,
  assetIndex: number,
  extras?: any
}

type CreatePaymentParams = {
  to: string,
  from?: string,
  amount?: number | bigint,
  note?: string,
  extras?: any
}


/**
 * Cosmos implementation of the IChainDriver interface.
 *
 * For documentation regarding what each function does, see the IChainDriver interface.
 *
 * Note that the Blockin library also has many convenient, chain-generic functions that implement
 * this logic for creating / verifying challenges. Before using, you will have to setChainDriver(new CosmosDriver(.....)) first.
 */
export default class CosmosDriver implements IChainDriver {
  chain;
  constructor(chain: string) {
    this.chain = chain;
  }
  /** Boilerplates - Not Implemented Yet */
  async makeAssetTxn(assetParams: CreateAssetParams) {
    throw 'Not implemented';
    return this.createUniversalTxn({}, ``);
  }
  async makeAssetTransferTxn(assetParams: any) {
    throw 'Not implemented';
    return this.createUniversalTxn({}, ``);
  }
  async sendTxn(signedTxnResult: any, txnId: string): Promise<any> {
    throw 'Not implemented';
    return;
  }
  async parseChallengeStringFromBytesToSign(txnBytes: Uint8Array) {
    const txnString = new TextDecoder().decode(txnBytes);
    const txnString2 = Buffer.from(
      txnString.substring(2),
      'hex'
    ).toString();
    return txnString2;
  }
  async lookupTransactionById(txnId: string) {
    throw 'Not implemented';
    return;
  }
  async getAssetDetails(assetId: string | Number): Promise<any> {
    throw 'Not implemented';
    return;
  }
  async getAllAssetsForAddress(address: string): Promise<any> {
    throw 'Not implemented';
    return;
  }
  async getLastBlockIndex() {
    throw 'Not implemented';
    return;
  }
  async getTimestampForBlock(blockIndexString: string) {
    throw 'Not implemented';
    return;
  }

  isValidAddress(address: string) {
    return getChainForAddress(address) === SupportedChain.COSMOS;
  }

  /**Not implemented */
  getPublicKeyFromAddress(address: string) {
    throw 'Not implemented';
    return new Uint8Array(0);
  }
  async verifySignature(originalChallengeToUint8Array: Uint8Array, signedChallenge: Uint8Array, originalAddress: string): Promise<void> {
    const originalString = await this.parseChallengeStringFromBytesToSign(
      originalChallengeToUint8Array
    );
    const pubKey = signedChallenge.slice(0, 33);
    const signature = signedChallenge.slice(33);

    const prefix = 'cosmos'; // change prefix for other chains...

    const isRecovered = verifyADR36Amino(
      prefix,
      originalAddress,
      originalString,
      pubKey,
      signature,
      'ethsecp256k1'
    );

    if (!isRecovered) {
      throw `Signature invalid for address ${originalAddress}`;
    }
  }

  async verifyOwnershipOfAssets(address: string, resources: string[], assetMinimumBalancesRequiredMap?: any, defaultMinimum?: number) {
    return; //TODO:
  }
  /**
   * Currently just a boilerplate
   */
  createUniversalTxn(txn: any, message: string): UniversalTxn {
    return {
      txn,
      message,
      txnId: txn.txnId,
      nativeTxn: txn,
    };
  }
}
