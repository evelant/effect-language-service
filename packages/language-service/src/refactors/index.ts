// import asyncAwaitToGen from "@effect/language-service/refactors/asyncAwaitToGen"
import addPipe from "@effect/language-service/refactors/addPipe"
import removeCurryArrow from "@effect/language-service/refactors/removeCurryArrow"
import removePipe from "@effect/language-service/refactors/removePipe"

export default { /*asyncAwaitToGen,*/ removePipe, addPipe, removeCurryArrow }
