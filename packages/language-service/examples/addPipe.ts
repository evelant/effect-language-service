import * as T from "@effect/core/io/Effect"
import { pipe } from "@tsplus/stdlib/data/Function"

const test = T.map(/* HERE */ (a: number) => a * 2)(T.succeed(1))
