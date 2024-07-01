const PREC = {
  call: 15,
  field: 14,
  try: 13,
  unary: 12,
  multiplicative: 10,
  additive: 9,
  shift: 8,
  bitand: 7,
  bitxor: 6,
  bitor: 5,
  comparative: 4,
  and: 3,
  or: 2,
  assign: 0,
};
const TOKEN_TREE_NON_SPECIAL_PUNCTUATION = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '!',
  '~',
  '&',
  '|',
  '&&',
  '||',
  '<<',
  '>>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '^=',
  '&=',
  '|=',
  '=',
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  '@',
  '..',
  '_',
  '.',
  ',',
  ';',
  ':',
  '::',
  '->',
  '=>',
  '#',
  '?',
];

const integerTypes = [
  'u8',
  'i8',
  'u16',
  'i16',
  'u32',
  'i32',
  'u64',
  'i64',
  'u128',
  'i128',
  'usize',
];
const primitiveTypes = integerTypes.concat(['bool', 'ByteArray', 'felt252']);
module.exports = grammar({
  name: 'cairo',

  extras: ($) => [/\s/, $.line_comment],
  conflicts: ($) => [
    [$._type, $._pattern],
    [$.unit_type, $.tuple_pattern],
    [$.scoped_identifier, $.scoped_type_identifier],
    [$._literal, $.negative_literal],
    [$.negative_literal, $._non_delim_token],
    [$.array_expression],
  ],
  inline: ($) => [
    $._path,
    $._type_identifier,
    $._field_identifier,
    $._non_special_token,
    $._declaration_statement,
    $._reserved_identifier,
  ],
  supertypes: ($) => [
    $.expression,
    $._type,
    $._literal,
    $._literal_pattern,
    $._declaration_statement,
    $._pattern,
  ],
  rules: {
    source_file: ($) => repeat($._statement),

    _statement: ($) => choice($.expression_statement, $._declaration_statement),

    _declaration_statement: ($) =>
      choice(
        $.const_item,
        $.macro_invocation,
        $.empty_statement,
        $.attribute_item,
        $.inner_attribute_item,
        $.mod_item,
        $.struct_item,
        $.enum_item,
        $.type_item,
        $.external_function_item,
        $.function_item,
        $.function_signature_item,
        $.impl_item,
        $.trait_item,
        $.let_declaration,
        $.use_declaration,
        $.associated_type,
        $.associated_impl,
      ),
    // Declaration section

    // For example here in:
    // trait A {
    //     type B;
    //     fn a(a: u32) -> u32;
    //     fn b(b: bool) -> bool;
    // }
    // The declaration list would be  `{ type B; fn a(a: u32) -> u32; fn b(b: bool) -> bool; }`,
    declaration_list: ($) => seq('{', repeat($._declaration_statement), '}'),

    // `impl Foo of FooTrait<...> { }
    // `impl Bar of BarTrait;`
    impl_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'impl',
        $.identifier,
        field('type_parameters', optional($.type_parameters)),
        'of',
        $._type,
        choice(field('body', $.declaration_list), ';'),
      ),

    // trait A {
    //     type B;
    //     fn a(a: u32) -> u32;
    //     fn b(b: bool) -> bool;
    // }
    trait_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'trait',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        choice(field('body', $.declaration_list), ';'),
      ),

    // trait A {
    //     type B;
    // }
    associated_type: ($) =>
      seq(
        'type',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        ';',
      ),

    // trait A {
    //     impl B<t>: A<T>;
    // }
    associated_impl: ($) =>
      seq('impl', field('name', $.identifier), ':', $._type, ';'),

    // const FOO: felt252 = 1;
    const_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'const',
        field('name', $.identifier),
        ':',
        field('type', $._type),
        optional(seq('=', field('value', $.expression))),
        ';',
      ),

    // array![]
    macro_invocation: ($) =>
      seq(
        field(
          'macro',
          choice($.scoped_identifier, $.identifier, $._reserved_identifier),
        ),
        '!',
        alias($.delim_token_tree, $.token_tree),
      ),

    empty_statement: (_) => ';',

    // #[derive(Debug)]
    attribute_item: ($) => seq('#', '[', $.attribute, ']'),

    // #![deny(missing_docs)]
    inner_attribute_item: ($) => seq('#', '!', '[', $.attribute, ']'),
    // for example in #[derive(Debug)], the attribute would be `derive(Debug)`
    attribute: ($) =>
      seq(
        $._path,
        optional(
          choice(
            seq('=', field('value', $.expression)),
            field('arguments', alias($.delim_token_tree, $.token_tree)),
          ),
        ),
      ),

    // mod abc;
    mod_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'mod',
        field('name', $.identifier),
        choice(';', field('body', $.declaration_list)),
      ),

    // struct Foo { bar: u32 }
    struct_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'struct',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        choice(seq(field('body', $.field_declaration_list)), ';'),
      ),

    // enum Direction { Left, Right: u32 };
    enum_item: ($) =>
      seq(
        optional($.visibility_modifier),
        'enum',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        field('body', $.enum_variant_list),
      ),

    // for example in enum Direction { Left, Right: u32 } it would be `{ Left, Right: u32 }`
    enum_variant_list: ($) =>
      seq(
        '{',
        sepBy(',', seq(repeat($.attribute_item), $.enum_variant)),
        optional(','),
        '}',
      ),

    // for example in enum Direction { Left, Right: u32 } it would be `Left` and `Right: u32`
    enum_variant: ($) =>
      choice(
        seq(optional($.visibility_modifier), field('variant', $.identifier)),
        field('variant', $.field_declaration),
      ),
    // struct and enum helper
    // for example in struct Foo { bar: u32 } it would be `{ bar: u32 }`
    field_declaration_list: ($) =>
      seq(
        '{',
        sepBy(',', seq(repeat($.attribute_item), $.field_declaration)),
        optional(','),
        '}',
      ),
    // struct and enum helper
    // for example in struct Foo { bar: u32 } it would be bar: u32
    field_declaration: ($) =>
      seq(
        optional($.visibility_modifier),
        field('name', $._field_identifier),
        ':',
        field('type', $._type),
      ),

    // impl HashBool<S, +HashStateTrait<S>, +Drop<S>> = into_felt252_based::HashImpl<bool, S>;
    // pub type usize = u32;
    type_item: ($) =>
      choice(
        $.extern_type,
        seq(
          optional($.visibility_modifier),
          choice('type', 'impl'),
          field('name', $._type_identifier),
          field('type_parameters', optional($.type_parameters)),
          '=',
          choice(field('type', $._type)),
          ';',
        ),
      ),

    // pub extern type Poseidon;
    extern_type: ($) =>
      seq(
        optional($.visibility_modifier),
        $.extern,
        'type',
        field('name', $._type_identifier),
        field('type_parameters', optional($.type_parameters)),
        ';',
      ),

    // pub extern fn hades_permutation(
    //     s0: felt252, s1: felt252, s2: felt252
    // ) -> (felt252, felt252, felt252) implicits(Poseidon) nopanic;
    external_function_item: ($) =>
      seq(optional($.visibility_modifier), $.extern, $.function, ';'),

    // fn default() -> HashState {
    //     PoseidonTrait::new()
    // }
    function_item: ($) =>
      seq(optional($.visibility_modifier), $.function, field('body', $.block)),

    // For example here in:
    // trait A {
    //     fn a(a: u32) -> u32;
    // } it would be `fn a(a: u32) -> u32;`
    function_signature_item: ($) =>
      seq(optional($.visibility_modifier), $.function, ';'),

    // Helper for function definition
    function: ($) =>
      seq(
        'fn',
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.parameters),
        optional(seq('->', field('return_type', $._type))),
        field(
          'implicit_arguments',
          optional(seq('implicits', sepBy(',', $._type))),
        ),
        optional($.nopanic),
      ),

    // let a = 1;
    let_declaration: ($) =>
      seq(
        'let',
        optional($.mutable_specifier),
        field('pattern', $._pattern),
        optional(seq(':', field('type', $._type))),
        optional(seq('=', field('value', $.expression))),
        ';',
      ),

    // pub use abc::def;
    use_declaration: ($) =>
      seq(
        optional($.visibility_modifier),
        'use',
        field('argument', $._use_clause),
        ';',
      ),

    // helper for use declaration
    _use_clause: ($) =>
      choice(
        $._path,
        $.use_as_clause,
        $.use_list,
        $.scoped_use_list,
        $.use_wildcard,
      ),
    // The following will consider the base example: use abc::def::{a as a, b, c::*};
    // abc::def::{a as a, b, c::*}
    scoped_use_list: ($) =>
      seq(field('path', optional($._path)), '::', field('list', $.use_list)),

    // {a as a, b, c::*}
    use_list: ($) =>
      seq('{', sepBy(',', choice($._use_clause)), optional(','), '}'),

    // a as a
    use_as_clause: ($) =>
      seq(field('path', $._path), 'as', field('alias', $.identifier)),

    // c::*
    use_wildcard: ($) => seq(optional(seq($._path, '::')), '*'),

    // for example in fn a(x: u32, y: u32) {} it would be (x: u32, y: u32)
    parameters: ($) =>
      seq(
        '(',
        sepBy(
          ',',
          seq(optional($.attribute_item), choice($.parameter, '_', $._type)),
        ),
        optional(','),
        ')',
      ),

    // x: u32
    parameter: ($) =>
      seq(
        optional(choice($.ref_specifier, $.mutable_specifier)),
        field('pattern', $._pattern),
        ':',
        field('type', $._type),
      ),

    // Types section
    _type: ($) =>
      choice(
        $.generic_type,
        $.generic_type_with_turbofish,
        $.scoped_type_identifier,
        $.snapshot_type,
        $.tuple_type,
        $.unit_type,
        $.array_type,
        $._type_identifier,
        $.macro_invocation,
        alias(choice(...primitiveTypes), $.primitive_type),
      ),

    // Helper
    _path: ($) =>
      choice(
        alias(choice(...primitiveTypes), $.identifier),
        $.super,
        $.identifier,
        $.scoped_identifier,
        $._reserved_identifier,
      ),

    // for example in trait A<T> {} it would be `<T>`
    type_parameters: ($) =>
      prec(
        1,
        seq(
          '<',
          sepBy1(
            ',',
            seq(
              repeat($.attribute_item),
              choice(
                $.generic_type,
                $._type_identifier,
                $.generic_type_with_turbofish,
                $._type_identifier,
                $.constrained_type_parameter,
                $.const_parameter,
              ),
            ),
          ),
          optional(','),
          '>',
        ),
      ),
    //  for example in pub extern fn const_as_box<T, const SEGMENT_ID: felt252>() -> Box<bool> nopanic;
    // it would be `const SEGMENT_ID: felt252`
    const_parameter: ($) =>
      seq('const', field('name', $.identifier), ':', field('type', $._type)),

    // for example in impl ArraySerde<T, +Serde<T>, impl TDrop: Drop<T>> of Serde<Array<T>> {} it would be
    // `+Serde<T>` and `impl TDrop: Drop<T>`
    constrained_type_parameter: ($) =>
      choice(
        seq(
          field('left', seq('impl', $._type_identifier, ':')),
          field('bound', $._type),
        ),
        seq(
          choice('+', '-'),
          choice(
            $.generic_type,
            $._type_identifier,
            $.generic_type_with_turbofish,
          ),
        ),
      ),
    // in let a: Array<T>; it would be `Array<T>`
    generic_type: ($) =>
      prec(
        1,
        seq(
          field(
            'type',
            choice(
              $._type_identifier,
              $._reserved_identifier,
              $.scoped_type_identifier,
            ),
          ),
          //   "::",
          field('type_arguments', $.type_arguments),
        ),
      ),

    // in let a: Array::<T>; it would be `Array::<T>`
    generic_type_with_turbofish: ($) =>
      seq(
        field(
          'type',
          choice(
            $._type_identifier,
            $._reserved_identifier,
            $.scoped_identifier,
          ),
        ),
        '::',
        field('type_arguments', $.type_arguments),
      ),
    // for example in let a: [u8; 32]; it would be `[u8; 32]`
    array_type: ($) =>
      seq(
        '[',
        field('element', $._type),
        optional(seq(';', field('length', $.expression))),
        ']',
      ),

    // Helper
    delim_token_tree: ($) =>
      choice(
        seq('(', repeat($._delim_tokens), ')'),
        seq('[', repeat($._delim_tokens), ']'),
        seq('{', repeat($._delim_tokens), '}'),
      ),
    // Helper
    _delim_tokens: ($) =>
      choice($._non_delim_token, alias($.delim_token_tree, $.token_tree)),

    // Matches non-delimiter tokens common to both macro invocations and
    // definitions.
    _non_special_token: ($) =>
      choice(
        $._literal,
        $.identifier,
        $.mutable_specifier,
        $.super,
        alias(choice(...primitiveTypes), $.primitive_type),
        prec.right(repeat1(choice(...TOKEN_TREE_NON_SPECIAL_PUNCTUATION))),
        'break',
        'const',
        'continue',
        'default',
        'enum',
        'fn',
        'if',
        'impl',
        'extern',
        'nopanic',
        'let',
        'loop',
        'match',
        'mod',
        'pub',
        'return',
        'static',
        'struct',
        'trait',
        'type',
        'use',
        'while',
      ),
    // Section - Patterns

    _pattern: ($) =>
      choice(
        $._literal_pattern,
        alias(choice(...primitiveTypes), $.identifier),
        $.identifier,
        $.scoped_identifier,
        $.tuple_pattern,
        $.struct_pattern,
        $._reserved_identifier,
        $.mut_pattern,
        $.or_pattern,
        $.slice_pattern,
        $.macro_invocation,
        $.tuple_enum_pattern,
        '_',
      ),
    // for example in let (a, b) = c; it would be `(a, b)`
    tuple_pattern: ($) => seq('(', sepBy(',', $._pattern), optional(','), ')'),

    // for example in let [a, b] = c; it would be `[a, b]`
    slice_pattern: ($) => seq('[', sepBy(',', $._pattern), optional(','), ']'),

    // for example in let Foo {a, b} = c; it would be `Foo {a, b}`
    struct_pattern: ($) =>
      seq(
        field('type', choice($._type_identifier, $.scoped_type_identifier)),
        '{',
        sepBy(',', $.field_pattern),
        optional(','),
        '}',
      ),
    // for example in let Foo { a: bar, b: baz } = c; it would be `a: bar` and `b: baz`
    field_pattern: ($) =>
      seq(
        optional($.mutable_specifier),
        choice(
          field('name', alias($.identifier, $.shorthand_field_identifier)),
          seq(
            field('name', $._field_identifier),
            ':',
            field('pattern', $._pattern),
          ),
        ),
      ),

    // for example in let a = Foo { a: 1, b: 2}; it would be `{ a: 1, b: 2}`
    field_initializer_list: ($) =>
      seq(
        '{',
        sepBy(
          ',',
          choice(
            $.shorthand_field_initializer,
            $.field_initializer,
            $.base_field_initializer,
          ),
        ),
        optional(','),
        '}',
      ),
    // for example in let a = Foo { a: 1, b}; it would be `b`
    shorthand_field_initializer: ($) =>
      seq(repeat($.attribute_item), $.identifier),

    // for example in let a = Foo { a: 1, b}; it would be `a: 1`
    field_initializer: ($) =>
      seq(
        repeat($.attribute_item),
        field('field', choice($._field_identifier, $.numeric_literal)),
        ':',
        field('value', $.expression),
      ),

    base_field_initializer: ($) => seq('..', $.expression),

    // for example in let mut a; it would be `mut a`
    mut_pattern: ($) => prec(-1, seq($.mutable_specifier, $._pattern)),

    // for example in
    // match a {
    //     Foo::A | Foo::B => ()
    // }
    // it would be Foo::A | Foo::B
    or_pattern: ($) =>
      prec.left(
        -2,
        choice(seq($._pattern, '|', $._pattern), seq('|', $._pattern)),
      ),

    // Section - Literals

    _literal: ($) =>
      choice(
        $.string_literal,
        $.shortstring_literal,
        $.boolean_literal,
        $.numeric_literal,
        $.negative_literal,
      ),

    _literal_pattern: ($) =>
      choice(
        $.string_literal,
        $.shortstring_literal,
        $.boolean_literal,
        $.numeric_literal,
        prec(-1, $.negative_literal),
      ),

    // for example in let a = -1; it would be `-1`
    negative_literal: ($) => seq('-', $.numeric_literal),

    // for example in let a = 1_u32; it would be `1_u32`
    numeric_literal: (_) =>
      token(
        seq(
          choice(/[0-9_]+/, /0x[0-9a-fA-F_]+/, /0b[01_]+/, /0o[0-7_]+/),
          optional(
            token.immediate(
              seq('_', choice(...integerTypes, 'u256', 'felt252')),
            ),
          ),
        ),
      ),

    // allows every ascii char except `"` unless it's escaped (accept escape sequences also)
    string_literal: ($) =>
      seq(alias(/[bc]?"/, '"'), /([^"\\]|\\.)*/, token.immediate('"')),

    // allows every ascii char except `"` unless it's escaped (accept escape sequences also). Max length is 31
    shortstring_literal: ($) =>
      token(seq('\'', /(([^'\\]|\\.){0,31})/, '\'', optional('_felt252'))),

    boolean_literal: (_) => choice('true', 'false'),

    // Should match any token other than a delimiter.
    _non_delim_token: ($) => choice($._non_special_token, '$'),
    // for example in let a = a::b; it would be `a::b`
    scoped_identifier: ($) =>
      seq(
        field(
          'path',
          optional(
            choice(
              $._path,
              alias($.generic_type_with_turbofish, $.generic_type),
            ),
          ),
        ),
        '::',
        field('name', choice($.identifier, $.super)),
      ),
    // Makes this type of expression work
    // core::pedersen::HashState { state }.update_with(value).state
    scoped_type_identifier_in_expression_position: ($) =>
      prec(
        -2,
        seq(
          field(
            'path',
            optional(
              choice(
                $._path,
                alias($.generic_type_with_turbofish, $.generic_type),
              ),
            ),
          ),
          '::',
          field('name', $._type_identifier),
        ),
      ),
    // for example in struct A {a: A::b} it would be `A::b`
    scoped_type_identifier: ($) =>
      seq(
        field(
          'path',
          optional(
            choice(
              $._path,
              alias($.generic_type_with_turbofish, $.generic_type),
              $.generic_type,
            ),
          ),
        ),
        '::',
        field('name', $._type_identifier),
      ),

    // for example in struct A {a: (u32, u32)} it would be `(u32, u32)`
    tuple_type: ($) => seq('(', sepBy1(',', $._type), optional(','), ')'),

    // for example in struct A {a: ()} it would be `()`
    unit_type: (_) => seq('(', ')'),

    // for example in struct A {a: B<T>} it would be `<T>`
    type_arguments: ($) =>
      seq(
        token(prec(1, '<')),
        sepBy1(',', seq(choice($._type, $._literal, $.block))),
        optional(','),
        '>',
      ),

    // Helper
    expression_statement: ($) =>
      choice(seq($.expression, ';'), prec(1, $._expression_ending_with_block)),

    expression: ($) =>
      choice(
        prec.left($.identifier),
        alias(choice(...primitiveTypes), $.identifier),
        prec.left($._reserved_identifier),
        $.binary_expression,
        $.call_expression,
        $._expression_ending_with_block,
        $._literal,
        $.reference_expression,
        $.field_expression,
        $.scoped_identifier,
        $.tuple_expression,
        $.unary_expression,
        $.struct_expression,
        $.try_expression,
        $.return_expression,
        $.assignment_expression,
        $.compound_assignment_expr,
        $.generic_function,
        $.array_expression,
        $.unit_expression,
        $.break_expression,
        $.continue_expression,
        $.index_expression,
        $.parenthesized_expression,
        prec(1, $.macro_invocation),
      ),
    // for example in a::<A>(); it would be `a::<A>`
    generic_function: ($) =>
      prec(
        1,
        seq(
          field(
            'function',
            choice($.identifier, $.scoped_identifier, $.field_expression),
          ),
          '::',
          field('type_arguments', $.type_arguments),
        ),
      ),

    // (1, 2)
    tuple_expression: ($) =>
      seq(
        '(',
        repeat($.attribute_item),
        seq($.expression, ','),
        repeat(seq($.expression, ',')),
        optional($.expression),
        ')',
      ),

    // return ()
    return_expression: ($) =>
      choice(prec.left(seq('return', $.expression)), prec(-1, 'return')),

    // A {a, b}
    struct_expression: ($) =>
      seq(
        field(
          'name',
          choice(
            $._type_identifier,
            alias(
              $.scoped_type_identifier_in_expression_position,
              $.scoped_type_identifier,
            ),
            $.generic_type_with_turbofish,
          ),
        ),
        field('body', $.field_initializer_list),
      ),

    // a = b
    assignment_expression: ($) =>
      prec.left(
        PREC.assign,
        seq(field('left', $.expression), '=', field('right', $.expression)),
      ),
    // break true
    break_expression: ($) => prec.left(seq('break', optional($.expression))),

    // continue
    continue_expression: ($) => prec.left(seq('continue')),

    // a[i]
    index_expression: ($) =>
      prec(PREC.call, seq($.expression, '[', $.expression, ']')),

    // [1, 2, 3]
    array_expression: ($) =>
      seq(
        '[',
        repeat($.attribute_item),
        choice(
          seq($.expression, ';', field('length', $.expression)),
          seq(
            sepBy(',', seq(repeat($.attribute_item), $.expression)),
            optional(','),
          ),
        ),
        ']',
      ),

    // (a())
    parenthesized_expression: ($) => seq('(', $.expression, ')'),

    // ()
    unit_expression: (_) => seq('(', ')'),

    // a += 1
    compound_assignment_expr: ($) =>
      prec.left(
        PREC.assign,
        seq(
          field('left', $.expression),
          field('operator', choice('+=', '-=', '*=', '/=', '%=')),
          field('right', $.expression),
        ),
      ),

    // Helper
    _expression_ending_with_block: ($) =>
      choice(
        $.block,
        $.if_expression,
        $.match_expression,
        $.while_expression,
        $.loop_expression,
      ),

    // @1
    unary_expression: ($) =>
      prec(PREC.unary, seq(choice('-', '*', '!', '~', '@'), $.expression)),

    // for example in let a = try_smth?; it would be `try_smth?`
    try_expression: ($) => prec(PREC.try, seq($.expression, '?')),

    // foo.bar
    field_expression: ($) =>
      prec(
        PREC.field,
        seq(
          field('value', $.expression),
          '.',
          field('field', choice($._field_identifier, $.numeric_literal)),
        ),
      ),

    // section delimited by `{` and `{`
    block: ($) => seq('{', repeat($._statement), optional($.expression), '}'),

    // if true { () } else { () }
    if_expression: ($) =>
      prec.right(
        seq(
          'if',
          field('condition', $._condition),
          field('consequence', $.block),
          optional(field('alternative', $.else_clause)),
        ),
      ),

    // for example in if a == b { () } else { () } it would be `a == b`
    _condition: ($) => choice($.expression, $.let_condition),
    // for example in if let Option::Some(a)= b { () } else { () } it would be `let Option::Some(a)= b`
    let_condition: ($) =>
      seq(
        'let',
        field('pattern', $._pattern),
        '=',
        field('value', prec.left(PREC.and, $.expression)),
      ),

    // for example in if a == b { () } else { () } it would be `else { () }`
    else_clause: ($) => seq('else', choice($.block, $.if_expression)),

    // match opt {
    //     Option::Some(a) => a,
    //     Option::None => 0,
    // }
    match_expression: ($) =>
      seq('match', field('value', $.expression), field('body', $.match_block)),

    // {
    //     Option::Some(a) => a,
    //     Option::None => 0,
    // }
    match_block: ($) =>
      seq(
        '{',
        optional(
          seq(repeat($.match_arm), alias($.last_match_arm, $.match_arm)),
        ),
        '}',
      ),
    // Option::Some(a) => a,
    // and
    // Option::None => 0,
    match_arm: ($) =>
      prec.right(
        seq(
          repeat(choice($.attribute_item, $.inner_attribute_item)),
          field('pattern', $.match_pattern),
          '=>',
          choice(
            seq(field('value', $.expression), ','),
            field('value', prec(1, $._expression_ending_with_block)),
          ),
        ),
      ),
    // for example in
    // match u256_guarantee_inv_mod_n(a, n) {
    //     Result::Ok((inv_a, _, _, _, _, _, _, _, _)) => Option::Some(inv_a),
    //     Result::Err(_) => Option::None(())
    // }
    // it would be Result::Err(_) => Option::None(())
    last_match_arm: ($) =>
      seq(
        repeat(choice($.attribute_item, $.inner_attribute_item)),
        field('pattern', $.match_pattern),
        '=>',
        field('value', $.expression),
        optional(','),
      ),

    // Option::Some(1)
    tuple_enum_pattern: ($) =>
      seq(
        field(
          'type',
          choice(
            $.identifier,
            $.scoped_identifier,
            alias($.generic_type_with_turbofish, $.generic_type),
          ),
        ),
        '(',
        sepBy(',', $._pattern),
        optional(','),
        ')',
      ),
    // for example in match opt {
    //     Option::Some(a) => a,
    //     Option::None => 0,
    // }
    // it would be `Option::Some(a)` and `Option::None`
    match_pattern: ($) =>
      seq($._pattern, optional(seq('if', field('condition', $._condition)))),

    // while a != b {}
    while_expression: ($) =>
      seq('while', field('condition', $._condition), field('body', $.block)),

    // loop {}
    loop_expression: ($) => seq('loop', field('body', $.block)),

    // a == b
    binary_expression: ($) => {
      const table = [
        [PREC.and, '&&'],
        [PREC.or, '||'],
        [PREC.bitand, '&'],
        [PREC.bitor, '|'],
        [PREC.bitxor, '^'],
        [PREC.comparative, choice('==', '!=', '<', '<=', '>', '>=')],
        [PREC.shift, choice('<<', '>>')],
        [PREC.additive, choice('+', '-')],
        [PREC.multiplicative, choice('*', '/', '%')],
      ];

      // @ts-ignore
      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field('left', $.expression),
              // @ts-ignore
              field('operator', operator),
              field('right', $.expression),
            ),
          ),
        ),
      );
    },

    // @Array<T>
    snapshot_type: ($) => seq('@', field('type', $._type)),
    // foo()
    call_expression: ($) =>
      prec(
        PREC.call,
        seq(field('function', $.expression), field('arguments', $.arguments)),
      ),
    // for example in foo(a, b, c) it would be `(a, b, c)`
    arguments: ($) =>
      seq(
        '(',
        sepBy(
          ',',
          seq(repeat($.attribute_item), choice($.expression, $.named_argument)),
        ),
        optional(','),
        ')',
      ),
    // for example in foo(bar: a, :b, :c) it would be `bar: a` and `:b`  and `c`
    named_argument: ($) => seq(optional($.identifier), ':', $.expression),

    // for example in foo(ref b) it would be `ref b`
    reference_expression: ($) =>
      prec(
        PREC.unary,
        seq('ref', optional($.mutable_specifier), field('value', $.expression)),
      ),

    // Helper alias
    _type_identifier: ($) => alias($.identifier, $.type_identifier),

    // General helpers
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    // keywords
    visibility_modifier: ($) =>
      prec(
        20,
        seq(
          'pub',
          optional(seq('(', choice($.super, $.crate, seq('in', $._path)), ')')),
        ),
      ),
    extern: (_) => 'extern',
    nopanic: (_) => 'nopanic',
    mutable_specifier: (_) => 'mut',
    ref_specifier: (_) => 'ref',
    super: (_) => 'super',
    crate: (_) => 'crate',
    _reserved_identifier: ($) => alias('default', $.identifier),

    // comments
    line_comment: ($) => token(seq('//', /.*/)),
    doc_comment: ($) => token(seq('///', /.*/)),

    _field_identifier: ($) => alias($.identifier, $.field_identifier),
  },
});

/**
 * Creates a rule to match one or more of the rules separated by the separator.
 *
 * @param {RuleOrLiteral} sep - The separator to use.
 * @param {RuleOrLiteral} rule
 *
 * @return {SeqRule}
 *
 */
function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}
/**
 * Creates a rule to optionally match one or more of the rules separated by the separator.
 *
 * @param {RuleOrLiteral} sep - The separator to use.
 * @param {RuleOrLiteral} rule
 *
 * @return {ChoiceRule}
 *
 */
function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}
