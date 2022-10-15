import * as AST from "@effect/language-service/ast"

export function isPipeCall(node: ts.Node) {
  return Do($ => {
    const ts = $(Effect.service(AST.TypeScriptApi))
    if (!ts.isCallExpression(node)) return false
    const expression = node.expression
    if (!ts.isIdentifier(expression)) return false
    if (expression.getText(node.getSourceFile()) !== "pipe") return false
    return true
  })
}

export function asPipeableCallExpression(node: ts.Node) {
  return Do($ => {
    const ts = $(Effect.service(AST.TypeScriptApi))
    // ensure the node is a call expression
    if (!ts.isCallExpression(node)) return Maybe.none
    // with just 1 arg
    if (node.arguments.length !== 1) return Maybe.none
    const arg = node.arguments[0]!
    // ideally T.map(n => n * 2) could be piped to pipe(n => n * 2, T.map)
    // but does not make any sense.
    if (ts.isArrowFunction(arg)) return Maybe.none
    // same goes for identifiers, string literal or numbers
    if (ts.isStringLiteral(arg) || ts.isNumericLiteral(arg) || ts.isIdentifier(arg)) return Maybe.none
    return Maybe.some([node.expression, arg] as const)
  })
}

export function asPipeArguments(initialNode: ts.Node) {
  return Do($ => {
    let result = Chunk.empty<ts.Expression>()
    $(
      Effect.iterate(Maybe.some(initialNode), node => node.isSome())(
        maybeNode =>
          Do($ => {
            if (maybeNode.isNone()) return Maybe.none

            const node = maybeNode.value
            const maybePipeable = $(asPipeableCallExpression(node))
            if (maybePipeable.isNone()) {
              result = result.append(node as ts.Expression)
              return Maybe.none
            }
            const [exp, arg] = maybePipeable.value
            result = result.append(exp)

            return Maybe.some(arg)
          })
      )
    )
    return result.reverse
  })
}

export function isPipeableCallExpression(node: ts.Node) {
  return asPipeableCallExpression(node).map(_ => _.isSome())
}

export function isCurryArrow(arrow: ts.Node) {
  return Do($ => {
    const ts = $(Effect.service(AST.TypeScriptApi))
    if (!ts.isArrowFunction(arrow)) return false
    if (arrow.parameters.length !== 1) return false
    const parameter = arrow.parameters[0]!
    const parameterName = parameter.name
    if (!ts.isIdentifier(parameterName)) return false
    const body = arrow.body
    if (!ts.isCallExpression(body)) return false
    const args = body.arguments
    if (args.length !== 1) return false
    const identifier = args[0]!
    if (!ts.isIdentifier(identifier)) return false
    return identifier.text === parameterName.text
  })
}
