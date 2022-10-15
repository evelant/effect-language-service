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
    if (!ts.isCallExpression(node)) return Maybe.none
    if (node.arguments.length !== 1) return Maybe.none
    return Maybe.some([node.expression, node.arguments[0]!] as const)
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
