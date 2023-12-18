import { deflate } from 'pako';

import {
  NoirCompilationResult,
  NoirContractCompilationArtifacts,
  NoirFunctionEntry,
  NoirProgramCompilationArtifacts,
  ProgramArtifact,
  isNoirContractCompilationArtifacts,
  isNoirProgramCompilationArtifacts,
} from '../noir_artifact.js';
import { ABIType, ContractArtifact, DebugMetadata, FunctionArtifact, FunctionType } from '../../types/abi.js';

// TODO - What to do?
export const FUNCTION_TREE_HEIGHT = 5;
export const mockVerificationKey =
  '0000000200000800000000740000000f00000003515f3109623eb3c25aa5b16a1a79fd558bac7a7ce62c4560a8c537c77ce80dd339128d1d37b6582ee9e6df9567efb64313471dfa18f520f9ce53161b50dbf7731bc5f900000003515f322bc4cce83a486a92c92fd59bd84e0f92595baa639fc2ed86b00ffa0dfded2a092a669a3bdb7a273a015eda494457cc7ed5236f26cee330c290d45a33b9daa94800000003515f332729426c008c085a81bd34d8ef12dd31e80130339ef99d50013a89e4558eee6d0fa4ffe2ee7b7b62eb92608b2251ac31396a718f9b34978888789042b790a30100000003515f342be6b6824a913eb7a57b03cb1ee7bfb4de02f2f65fe8a4e97baa7766ddb353a82a8a25c49dc63778cd9fe96173f12a2bc77f3682f4c4448f98f1df82c75234a100000003515f351f85760d6ab567465aadc2f180af9eae3800e6958fec96aef53fd8a7b195d7c000c6267a0dd5cfc22b3fe804f53e266069c0e36f51885baec1e7e67650c62e170000000c515f41524954484d455449430d9d0f8ece2aa12012fa21e6e5c859e97bd5704e5c122064a66051294bc5e04213f61f54a0ebdf6fee4d4a6ecf693478191de0c2899bcd8e86a636c8d3eff43400000003515f43224a99d02c86336737c8dd5b746c40d2be6aead8393889a76a18d664029096e90f7fe81adcc92a74350eada9622ac453f49ebac24a066a1f83b394df54dfa0130000000c515f46495845445f42415345060e8a013ed289c2f9fd7473b04f6594b138ddb4b4cf6b901622a14088f04b8d2c83ff74fce56e3d5573b99c7b26d85d5046ce0c6559506acb7a675e7713eb3a00000007515f4c4f4749430721a91cb8da4b917e054f72147e1760cfe0ef3d45090ac0f4961d84ec1996961a25e787b26bd8b50b1a99450f77a424a83513c2b33af268cd253b0587ff50c700000003515f4d05dbd8623b8652511e1eb38d38887a69eceb082f807514f09e127237c5213b401b9325b48c6c225968002318095f89d0ef9cf629b2b7f0172e03bc39aacf6ed800000007515f52414e474504b57a3805e41df328f5ca9aefa40fad5917391543b7b65c6476e60b8f72e9ad07c92f3b3e11c8feae96dedc4b14a6226ef3201244f37cfc1ee5b96781f48d2b000000075349474d415f3125001d1954a18571eaa007144c5a567bb0d2be4def08a8be918b8c05e3b27d312c59ed41e09e144eab5de77ca89a2fd783be702a47c951d3112e3de02ce6e47c000000075349474d415f3223994e6a23618e60fa01c449a7ab88378709197e186d48d604bfb6931ffb15ad11c5ec7a0700570f80088fd5198ab5d5c227f2ad2a455a6edeec024156bb7beb000000075349474d415f3300cda5845f23468a13275d18bddae27c6bb189cf9aa95b6a03a0cb6688c7e8d829639b45cf8607c525cc400b55ebf90205f2f378626dc3406cc59b2d1b474fba000000075349474d415f342d299e7928496ea2d37f10b43afd6a80c90a33b483090d18069ffa275eedb2fc2f82121e8de43dc036d99b478b6227ceef34248939987a19011f065d8b5cef5c0000000010000000000000000100000002000000030000000400000005000000060000000700000008000000090000000a0000000b0000000c0000000d0000000e0000000f';

/**
 * Returns whether the ABI type is an Aztec or Ethereum Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isAddressStruct(abiType: ABIType) {
  return isEthereumAddressStruct(abiType) || isAztecAddressStruct(abiType);
}

/**
 * Returns whether the ABI type is an Ethereum Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isEthereumAddressStruct(abiType: ABIType) {
  return abiType.kind === 'struct' && abiType.path.endsWith('::types::address::EthereumAddress');
}

/**
 * Returns whether the ABI type is an Aztec Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isAztecAddressStruct(abiType: ABIType) {
  return abiType.kind === 'struct' && abiType.path.endsWith('::types::address::AztecAddress');
}

/**
 * Generates a function build artifact. Replaces verification key with a mock value.
 * @param fn - Noir function entry.
 * @returns Function artifact.
 */
function generateFunctionArtifact(fn: NoirFunctionEntry): FunctionArtifact {
  const functionType = fn.function_type.toLowerCase() as FunctionType;
  const isInternal = fn.is_internal;

  // If the function is not unconstrained, the first item is inputs or CallContext which we should omit
  let parameters = fn.abi.parameters;
  if (functionType !== FunctionType.UNCONSTRAINED) {
    parameters = parameters.slice(1);
  }

  // If the function is secret, the return is the public inputs, which should be omitted
  const returnTypes = functionType === FunctionType.SECRET ? [] : [fn.abi.return_type];

  return {
    name: fn.name,
    functionType,
    isInternal,
    parameters,
    returnTypes,
    bytecode: fn.bytecode,
    verificationKey: mockVerificationKey,
  };
}

/**
 * Entrypoint for generating the .json artifact for compiled contract or program
 * @param compileResult - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateArtifact(compileResult: NoirCompilationResult) {
  if (isNoirContractCompilationArtifacts(compileResult)) {
    return generateContractArtifact(compileResult);
  } else if (isNoirProgramCompilationArtifacts(compileResult)) {
    return generateProgramArtifact(compileResult);
  } else {
    throw Error('Unsupported artifact type');
  }
}

/**
 * Given a Nargo output generates an Aztec-compatible contract artifact.
 * @param compiled - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateProgramArtifact(
  { program }: NoirProgramCompilationArtifacts,
  // eslint-disable-next-line camelcase
  noir_version?: string,
): ProgramArtifact {
  return {
    // eslint-disable-next-line camelcase
    noir_version,
    hash: program.hash,
    backend: program.backend,
    abi: program.abi,

    // TODO: should we parse and write the debug?  it doesn't seem to be in the nargo output
    // debug: someParsedDebug,
  };
}

/**
 * Given a Nargo output generates an Aztec-compatible contract artifact.
 * @param compiled - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateContractArtifact(
  { contract, debug }: NoirContractCompilationArtifacts,
  aztecNrVersion?: string,
): ContractArtifact {
  const constructorArtifact = contract.functions.find(({ name }) => name === 'constructor');
  if (constructorArtifact === undefined) {
    throw new Error('Contract must have a constructor function');
  }
  if (contract.functions.length > 2 ** FUNCTION_TREE_HEIGHT) {
    throw new Error(`Contract can only have a maximum of ${2 ** FUNCTION_TREE_HEIGHT} functions`);
  }
  const originalFunctions = contract.functions;
  // TODO why sort? we should have idempotent compilation so this should not be needed.
  const sortedFunctions = [...contract.functions].sort((fnA, fnB) => fnA.name.localeCompare(fnB.name));
  let parsedDebug: DebugMetadata | undefined = undefined;

  if (debug) {
    parsedDebug = {
      debugSymbols: sortedFunctions.map((fn) => {
        const originalIndex = originalFunctions.indexOf(fn);
        return Buffer.from(deflate(JSON.stringify(debug.debug_symbols[originalIndex]))).toString('base64');
      }),
      fileMap: debug.file_map,
    };
  }

  return {
    name: contract.name,
    functions: sortedFunctions.map(generateFunctionArtifact),
    events: contract.events,
    debug: parsedDebug,
    aztecNrVersion,
  };
}
