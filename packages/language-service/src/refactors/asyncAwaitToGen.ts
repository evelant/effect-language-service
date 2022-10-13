import * as T from "@effect/core/io/Effect"
import * as AST from "@effect/language-service/ast"
import { createRefactor } from "@effect/language-service/refactors/definition"

export default createRefactor({
  name: "effect/asyncAwaitToGen",
  description: "Convert to Effect.gen",
  apply: (sourceFile, textRange) =>
    Do($ => {
      const ts = $(T.service(AST.TypeScriptApi))
      const languageService = $(T.service(AST.LanguageServiceApi))

      const nodes = $(AST.getNodesContainingRange(sourceFile, textRange))
      return nodes.filter(ts.isFunctionDeclaration).filter(node => !!node.body).filter(node =>
        !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Async)
      ).head.map(node =>
        Do($ => {
          const changeTracker = $(T.service(AST.ChangeTrackerApi))
          const typeChecker = languageService.getProgram()?.getTypeChecker()

          function visitor(node: ts.Node) {
            console.log(
              node.getText(sourceFile),
              typeChecker?.typeToString(typeChecker?.getTypeAtLocation(node))
            )
            ts.visitEachChild(node, visitor, ts.nullTransformationContext)

            return node
          }
          ts.visitEachChild(sourceFile, visitor, ts.nullTransformationContext)

          function logErrors(fileName: string) {
            const allDiagnostics = languageService.getCompilerOptionsDiagnostics()
              .concat(languageService.getSyntacticDiagnostics(fileName))
              .concat(languageService.getSemanticDiagnostics(fileName))

            allDiagnostics.forEach(diagnostic => {
              const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
              if (diagnostic.file) {
                const { character, line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
                console.log(`  Error ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`)
              } else {
                console.log(`  Error: ${message}`)
              }
            })
          }
          logErrors(sourceFile.fileName)

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
      )
    })
})
