import * as AST from "@effect/language-service/ast"
import asyncAwaitToGen from "@effect/language-service/refactors/asyncAwaitToGen"
import type { RefactorDefinition } from "@effect/language-service/refactors/definition"
import * as O from "@tsplus/stdlib/data/Maybe"
import * as fs from "fs"
import ts from "typescript/lib/tsserverlibrary"

function createVirtualFile(fileName: string, sourceText: string) {
  const files = { [fileName]: sourceText }

  const languageServiceHost: ts.LanguageServiceHost = {
    getCompilationSettings() {
      return { ...ts.getDefaultCompilerOptions(), strict: true, target: ts.ScriptTarget.ESNext, noEmit: true }
    },
    getScriptFileNames() {
      return [fileName]
    },
    getScriptVersion(_fileName) {
      return ""
    },
    getScriptSnapshot(fileName) {
      if (fileName in files) {
        return ts.ScriptSnapshot.fromString(files[fileName] || "")
      }
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName).toString())
    },
    getCurrentDirectory: () => ".",
    getDefaultLibFileName(options) {
      return ts.getDefaultLibFilePath(options)
    },
    fileExists: (fileName) => {
      if (fileName.endsWith(".d.ts")) {
        return fs.existsSync(fileName)
      }
      return !!files[fileName]
    },
    readFile: (fileName) => {
      if (fileName in files) return files[fileName]
      return fs.readFileSync(fileName).toString()
    }
  }

  const languageService = ts.createLanguageService(
    languageServiceHost,
    undefined,
    ts.LanguageServiceMode.Semantic
  )

  const sourceFile_ = languageService.getProgram()?.getSourceFile(fileName)
  const sourceFile = sourceFile_!

  function applyFileTextChanges(edits: readonly ts.FileTextChanges[]): string {
    const newFiles: Record<string, string> = JSON.parse(JSON.stringify(files))
    for (const fileTextChange of edits) {
      forEachTextChange(fileTextChange.textChanges, (edit) => {
        const content = files[fileTextChange.fileName] || ""
        const prefix = content.substring(0, edit.span.start)
        const middle = edit.newText
        const suffix = content.substring(edit.span.start + edit.span.length)
        newFiles[fileTextChange.fileName] = prefix + middle + suffix
      })
    }
    return newFiles[fileName] || ""
  }

  /** Apply each textChange in order, updating future changes to account for the text offset of previous changes. */
  function forEachTextChange(
    changes: readonly ts.TextChange[],
    cb: (change: ts.TextChange) => void
  ): void {
    // Copy this so we don't ruin someone else's copy
    changes = JSON.parse(JSON.stringify(changes))
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]!
      cb(change)
      const changeDelta = change.newText.length - change.span.length
      for (let j = i + 1; j < changes.length; j++) {
        if (changes[j]!.span.start >= change.span.start) {
          changes[j]!.span.start += changeDelta
        }
      }
    }
  }

  return {
    languageServiceHost,
    languageService,
    applyFileTextChanges,
    sourceFile
  }
}

export function testRefactorOnExample(refactor: RefactorDefinition, fileName: string) {
  const sourceWithMarker = fs.readFileSync(require.resolve(__dirname + "/../../examples/" + fileName))
    .toString("utf8")
  const cursorPosition = sourceWithMarker.indexOf("/* HERE */")
  const textRange = { pos: cursorPosition, end: cursorPosition + 1 }
  const {
    applyFileTextChanges,
    languageService,
    languageServiceHost,
    sourceFile
  } = createVirtualFile(fileName, sourceWithMarker)

  const canApply = refactor
    .apply(sourceFile, textRange)
    .provideService(AST.TypeScriptApi, ts)
    .provideService(AST.LanguageServiceApi, languageService)
    .unsafeRunSync()

  expect(O.isSome(canApply)).toBe(true)
  if (O.isNone(canApply)) return

  const formatContext = ts.formatting.getFormatContext(
    ts.getDefaultFormatCodeSettings("\n"),
    { getNewLine: () => "\n" }
  )
  const edits = ts.textChanges.ChangeTracker.with(
    {
      formatContext,
      host: languageServiceHost,
      preferences: {}
    },
    (changeTracker) =>
      canApply.value
        .provideService(AST.ChangeTrackerApi, changeTracker)
        .unsafeRunSync()
  )

  expect(applyFileTextChanges(edits)).toMatchSnapshot()
}

function testRefactor(name: string, refactor: RefactorDefinition, fileNames: string[]) {
  for (const fileName of fileNames) {
    describe(fileName, () => {
      it(fileName, () => {
        testRefactorOnExample(refactor, fileName)
      })
    })
  }
}

testRefactor("asyncAwaitToGen", asyncAwaitToGen, ["asyncAwaitToGen.ts"])
