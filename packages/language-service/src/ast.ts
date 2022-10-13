import * as T from "@effect/core/io/Effect"
import * as CH from "@tsplus/stdlib/collections/Chunk"
import { Tag } from "@tsplus/stdlib/service/Tag"

declare module "typescript/lib/tsserverlibrary" {
  const nullTransformationContext: ts.TransformationContext

  export namespace formatting {
    interface FormattingHost {
      getNewLine?(): string
    }

    export interface FormatContext {
      readonly options: ts.FormatCodeSettings
      readonly getRules: unknown
    }

    function getFormatContext(options: ts.FormatCodeSettings, host: FormattingHost): FormatContext
  }

  export type TextChangesContext = any
  export type ChangeNodeOptions = any

  export namespace textChanges {
    export class ChangeTracker {
      static with(context: ts.TextChangesContext, cb: (tracker: ChangeTracker) => void): ts.FileTextChanges[]
      replaceNode(sourceFile: ts.SourceFile, oldNode: ts.Node, newNode: ts.Node, options?: ts.ChangeNodeOptions): void
    }
    export function applyChanges(text: string, changes: readonly ts.TextChange[]): string
  }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export const TypeScriptApi = Tag<typeof import("typescript/lib/tsserverlibrary")>()
export const LanguageServiceApi = Tag<ts.LanguageService>()
export const ChangeTrackerApi = Tag<ts.textChanges.ChangeTracker>()

export class NoTypeScriptProgramError {
  readonly _tag = "NoTypeScriptProgramError"
}

export function getProgram() {
  return T.serviceWithEffect(LanguageServiceApi, languageService => T.sync(() => languageService.getProgram()))
    .filterOrFail((program): program is ts.Program => !!program, () => new NoTypeScriptProgramError())
}

export class NoSuchSourceFile {
  readonly _tag = "NoSuchSourceFile"
  constructor(
    readonly fileName: string
  ) {}
}

export function getSourceFile(fileName: string) {
  return getProgram().map(program => program.getSourceFile(fileName))
    .filterOrFail((sourceFile): sourceFile is ts.SourceFile => !!sourceFile, () => new NoSuchSourceFile(fileName))
}

export function hasModifier(node: ts.Declaration, kind: ts.ModifierFlags) {
  return T.serviceWith(TypeScriptApi, ts => !!(ts.getCombinedModifierFlags(node) & kind))
}

/**
 * Gets the closest node that contains given TextRange
 */
export function getNodesContainingRange(
  sourceFile: ts.SourceFile,
  textRange: ts.TextRange
) {
  return Do(($) => {
    const ts = $(T.service(TypeScriptApi))
    let result = CH.empty<ts.Node>()
    let currentNode: ts.Node = sourceFile
    let continueLoop = true
    while (continueLoop) {
      const node = currentNode
      ts.forEachChild(node, testNode => {
        if (testNode.end < textRange.pos) {
          // node end is before the text range, find next node
          return
        }
        if (testNode.pos > textRange.end) {
          // node beginning is after range, we exit
          continueLoop = false
          return
        }
        // node is a candidate
        result = result.append(testNode)
        currentNode = testNode
      })
      if (node === currentNode) return result
    }

    return CH.from(result.reverse)
  })
}

/**
 * Ensures value is a text range
 */
export function toTextRange(positionOrRange: number | ts.TextRange): ts.TextRange {
  return typeof positionOrRange === "number" ? { end: positionOrRange, pos: positionOrRange } : positionOrRange
}
