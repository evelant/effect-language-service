import * as T from "@effect/core/io/Effect"
import * as CH from "@tsplus/stdlib/collections/Chunk"
import { Tag } from "@tsplus/stdlib/service/Tag"
import type ts from "typescript/lib/tsserverlibrary"

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

function getChildNodesContainingRange(
  parent: ts.Node,
  textRange: ts.TextRange
) {
  return Do($ => {
    const ts = $(Effect.service(TypeScriptApi))
    let result: Chunk<ts.Node> = Chunk.empty()

    ts.forEachChild(parent, node => {
      if (node.end < textRange.pos) {
        return
      } else if (node.pos > textRange.end) {
        return
      } else {
        result = result.append(node)
      }
    })

    return result
  })
}

/**
 * Gets the closest node that contains given TextRange
 */
export function getNodesContainingRange(
  sourceFile: ts.SourceFile,
  textRange: ts.TextRange
) {
  return Do(($) => {
    let result: Chunk<ts.Node> = Chunk.empty()

    $(
      Effect.iterate([sourceFile] as ts.Node[], (_) => _.length > 0)(toProcess => {
        const node = toProcess.shift()!
        return getChildNodesContainingRange(node, textRange).flatMap(_ =>
          Effect.sync(() => {
            result = result.concat(_)
            return toProcess.concat(..._.toArray)
          })
        )
      })
    )

    return CH.from(result.reverse)
  })
}

/**
 * Ensures value is a text range
 */
export function toTextRange(positionOrRange: number | ts.TextRange): ts.TextRange {
  return typeof positionOrRange === "number" ? { end: positionOrRange, pos: positionOrRange } : positionOrRange
}
