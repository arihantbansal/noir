use acir::circuit::{Circuit, ExpressionWidth, OpcodeLocation};

// The various passes that we can use over ACIR
mod optimizers;
mod transformers;

pub use optimizers::optimize;
use optimizers::optimize_internal;
pub use transformers::transform;
use transformers::transform_internal;

/// This module moves and decomposes acir opcodes. The transformation map allows consumers of this module to map
/// metadata they had about the opcodes to the new opcode structure generated after the transformation.
#[derive(Debug)]
pub struct AcirTransformationMap {
    /// This is a vector of pointers to the old acir opcodes. The index of the vector is the new opcode index.
    /// The value of the vector is the old opcode index pointed.
    acir_opcode_positions: Vec<usize>,
}

impl AcirTransformationMap {
    pub fn new_locations(
        &self,
        old_location: OpcodeLocation,
    ) -> impl Iterator<Item = OpcodeLocation> + '_ {
        let old_acir_index = match old_location {
            OpcodeLocation::Acir(index) => index,
            OpcodeLocation::Brillig { acir_index, .. } => acir_index,
        };

        self.acir_opcode_positions
            .iter()
            .enumerate()
            .filter(move |(_, &old_index)| old_index == old_acir_index)
            .map(move |(new_index, _)| match old_location {
                OpcodeLocation::Acir(_) => OpcodeLocation::Acir(new_index),
                OpcodeLocation::Brillig { brillig_index, .. } => {
                    OpcodeLocation::Brillig { acir_index: new_index, brillig_index }
                }
            })
    }
}

fn transform_assert_messages(
    assert_messages: Vec<(OpcodeLocation, String)>,
    map: &AcirTransformationMap,
) -> Vec<(OpcodeLocation, String)> {
    assert_messages
        .into_iter()
        .flat_map(|(location, message)| {
            let new_locations = map.new_locations(location);
            new_locations.into_iter().map(move |new_location| (new_location, message.clone()))
        })
        .collect()
}

/// Applies [`ProofSystemCompiler`][crate::ProofSystemCompiler] specific optimizations to a [`Circuit`].
pub fn compile(
    acir: Circuit,
    expression_width: ExpressionWidth,
) -> (Circuit, AcirTransformationMap) {
    let (acir, AcirTransformationMap { acir_opcode_positions }) = optimize_internal(acir);

    let (mut acir, transformation_map) =
        transform_internal(acir, expression_width, acir_opcode_positions);

    acir.assert_messages = transform_assert_messages(acir.assert_messages, &transformation_map);

    (acir, transformation_map)
}
