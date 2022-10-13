import * as T from "@effect/core/io/Effect"
import * as AST from "@effect/language-service/ast"
import refactors from "@effect/language-service/refactors/index"
import { identity } from "@tsplus/stdlib/data/Function"
import * as O from "@tsplus/stdlib/data/Maybe"

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export default function init(modules: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const languageService = info.languageService

    // create the proxy
    const proxy: ts.LanguageService = Object.create(null)
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      // @ts-expect-error
      proxy[k] = (...args: Array<{}>) => languageService[k]!.apply(languageService, args)
    }

    proxy.getApplicableRefactors = (...args) => {
      const applicableRefactors = languageService.getApplicableRefactors(...args)
      const [fileName, positionOrRange] = args
      const textRange = AST.toTextRange(positionOrRange)

      const effectRefactors = AST.getSourceFile(fileName).flatMap(sourceFile =>
        T.collectAllWith(
          refactors.map(refactor =>
            refactor.apply(sourceFile, textRange).map(canApply =>
              canApply.map(_ => ({
                name: refactor.name,
                description: refactor.description,
                actions: [{
                  name: refactor.name,
                  description: refactor.description
                }]
              }))
            )
          ),
          identity
        )
      ).map(v => Array.from(v))
        .provideService(AST.LanguageServiceApi, info.languageService)
        .provideService(AST.TypeScriptApi, modules.typescript)
        .unsafeRunSync()

      info.project.projectService.logger.info(
        "[@effect/language-service] possible refactors are " + JSON.stringify(effectRefactors)
      )

      return applicableRefactors.concat(effectRefactors)
    }

    proxy.getEditsForRefactor = (
      fileName,
      formatOptions,
      positionOrRange,
      refactorName,
      actionName,
      preferences,
      ...args
    ) => {
      for (const refactor of refactors) {
        if (refactor.name === refactorName) {
          return Do($ => {
            const sourceFile = $(AST.getSourceFile(fileName))
            const textRange = AST.toTextRange(positionOrRange)
            const possibleRefactor = $(refactor.apply(sourceFile, textRange))

            if (O.isNone(possibleRefactor)) {
              info.project.projectService.logger.info(
                "[@effect/language-service] requested refactor " + refactorName + " is not applicable"
              )
              return { edits: [] }
            }

            const formatContext = ts.formatting.getFormatContext(formatOptions, info.languageServiceHost)
            const edits = ts.textChanges.ChangeTracker.with(
              {
                formatContext,
                host: info.languageServiceHost,
                preferences: preferences || {}
              },
              changeTracker =>
                possibleRefactor.value.provideService(AST.ChangeTrackerApi, changeTracker).unsafeRunSync()
            )

            return { edits }
          }).provideService(AST.TypeScriptApi, modules.typescript)
            .provideService(AST.LanguageServiceApi, info.languageService)
            .unsafeRunSync()
        }
      }

      return languageService.getEditsForRefactor(
        fileName,
        formatOptions,
        positionOrRange,
        refactorName,
        actionName,
        preferences,
        ...args
      )
    }

    return proxy
  }

  return { create }
}
