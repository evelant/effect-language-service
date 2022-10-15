import * as T from "@effect/core/io/Effect"
import * as AST from "@effect/language-service/ast"
import { createRefactor } from "@effect/language-service/refactors/definition"

export default createRefactor({
  name: "effect/asyncAwaitToGen",
  description: "Convert to Effect.gen",
  apply: (sourceFile, textRange) =>
    Do($ => {
      const ts = $(T.service(AST.TypeScriptApi))

      const nodes = $(AST.getNodesContainingRange(sourceFile, textRange))

      return nodes.filter(ts.isFunctionDeclaration).filter(node => !!node.body).filter(node =>
        !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Async)
      ).head.map(node => ({
        description: "Convert to Effect.gen",
        apply: Do($ => {
          const changeTracker = $(T.service(AST.ChangeTrackerApi))

          let currentFlags = ts.getCombinedModifierFlags(node)
          currentFlags &= ~ts.ModifierFlags.Async
          const newDeclaration = ts.factory.createFunctionDeclaration(
            ts.factory.createModifiersFromModifierFlags(currentFlags),
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            ts.factory.createBlock([
              ts.factory.createReturnStatement(
                ts.factory.createIdentifier("undef")
              )
            ])
          )

          changeTracker.replaceNode(sourceFile, node, newDeclaration)
        })
      }))
    })
})
