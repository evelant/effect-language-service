import * as T from "@effect/core/io/Effect"
import * as AST from "@effect/language-service/ast"
import { createRefactor } from "@effect/language-service/refactors/definition"

export default createRefactor({
  name: "effect/removeCurryArrow",
  description: "Remove arrow",
  apply: (sourceFile, textRange) =>
    Do($ => {
      const ts = $(T.service(AST.TypeScriptApi))

      const nodes = $(AST.getNodesContainingRange(sourceFile, textRange))

      return nodes.filter(ts.isArrowFunction).filter(arrow => {
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
      }).head.map(node => ({
        description: `Remove arrow ${AST.getHumanReadableName(sourceFile, node.body)}`,
        apply: Do($ => {
          const changeTracker = $(T.service(AST.ChangeTrackerApi))

          if (!ts.isCallExpression(node.body)) return
          const newNode = node.body.expression
          changeTracker.replaceNode(sourceFile, node, newNode)
        })
      }))
    })
})
