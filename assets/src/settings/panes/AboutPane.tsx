import { PaneHead } from "./pane-parts"
import { BrandMark, BRAND_SERIF } from "../../brand/BrandMark"

export function AboutPane() {
  return (
    <div className="flex flex-col gap-4">
      <PaneHead title="About" lede="" />
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <div className="text-base font-bold text-ink">すいこう Suikou</div>
          <div className="text-xs text-muted">Deliberate review of every change.</div>
        </div>
      </div>
      <p className="max-w-[52ch] text-xs leading-[1.5] text-muted">
        推敲 is the act of weighing the exact word to use. Suikou turns review into a real workbench:
        read closely, anchor comments, set a verdict per file, submit a round, iterate.
      </p>
      <figure className="max-w-[52ch] rounded-[10px] border border-hair bg-soft px-4 py-3">
        <blockquote
          className="text-[15px] leading-[1.9] text-ink"
          style={{ fontFamily: BRAND_SERIF }}
        >
          <div>鳥宿池邊樹，</div>
          <div>
            僧<span className="text-accent-bright font-medium">敲</span>月下門。
          </div>
        </blockquote>
        <figcaption className="mt-2 text-xs leading-[1.5] text-muted">
          賈島《題李凝幽居》。初擬「
          <span className="text-accent-bright">推</span>」字，復欲作「
          <span className="text-accent-bright">敲</span>
          」，煉之未定，引手作勢，「推敲」遂出於此。
        </figcaption>
      </figure>
    </div>
  )
}
