import { observer } from "mobx-react-lite"

import { PaneHead, Row } from "./pane-parts"
import { BUILD_INFO } from "../../build-info"
import { BrandMark, BRAND_SERIF } from "../../brand/BrandMark"
import { Switch } from "../../components/ui/switch"
import { uiStore } from "../../stores/ui-store"

export const AboutPane = observer(function AboutPane() {
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
      <section className="flex max-w-[52ch] flex-col gap-3 border-t border-hair pt-4">
        <div className="flex items-center gap-[7px] text-2xs font-bold uppercase tracking-[0.12em] text-faint">
          The name
          <span aria-hidden className="h-px flex-1 bg-hair" />
        </div>
        <p className="text-sm leading-[1.5] text-text">
          推敲 (suikou) is the act of weighing which word is exactly the right one.
        </p>
        <figure className="rounded-[10px] border border-hair bg-soft px-4 py-3">
          <blockquote
            className="text-[15px] leading-[1.9] text-ink"
            style={{ fontFamily: BRAND_SERIF }}
          >
            <div>閒居少鄰並，草徑入荒園。</div>
            <div>
              鳥宿池邊樹，僧<span className="text-accent-bright font-medium">敲</span>月下門。
            </div>
            <div>過橋分野色，移石動雲根。</div>
            <div>暫去還來此，幽期不負言。</div>
          </blockquote>
          <figcaption className="mt-2 text-xs leading-[1.5] text-muted">
            賈島《題李凝幽居》
          </figcaption>
        </figure>
        <p className="text-xs leading-[1.6] text-muted">
          Jia Dao (779–843) rode into Chang&rsquo;an unable to settle the second couplet: did the
          monk <span className="text-accent-bright">推</span> <em>push</em> the moonlit gate, or{" "}
          <span className="text-accent-bright">敲</span> <em>knock at</em> it? Miming both gestures
          on his donkey, he rode straight into Han Yu&rsquo;s procession — who heard him out and
          picked 敲. The word for revision has meant those two characters ever since.
        </p>
        <p className="text-xs leading-[1.6] text-muted">
          The choice is not about sound alone. <em>Knock</em> puts someone behind the door and a
          single noise into a silent night; the monk arrives as a guest. <em>Push</em> leaves the
          gate unlatched and the monk alone at his own door, colder and more of a piece with a poem
          about living out of anyone&rsquo;s reach. One character decides who is host, who is guest,
          and whether the night makes a sound.
        </p>
        <p className="border-l-2 border-accent-edge pl-3 text-sm leading-[1.5] text-ink">
          Reviewing code is the same act: not catching typos, but weighing what each choice actually
          changes.
        </p>
      </section>
      <BuildRow />
      <div className="border-t border-hair pt-4">
        <Row
          title="Collect error logs"
          sub="Keeps the last 50 errors this browser hits, in an Errors tab. Stored here only — nothing is sent anywhere."
        >
          <Switch
            aria-label="Collect error logs"
            checked={uiStore.errorLog}
            onCheckedChange={(v) => uiStore.setErrorLog(v)}
          />
        </Row>
      </div>
    </div>
  )
})

/** What this bundle was built from. Worth showing because the app updates itself
 * in the background: without it there is no way to tell whether the page in
 * front of you is the build you just made. */
function BuildRow() {
  const { commit, subject, dirty, builtAt } = BUILD_INFO

  return (
    <dl className="max-w-[52ch] border-t border-hair pt-4 text-xs">
      <div className="flex gap-3 py-1">
        <dt className="w-[72px] shrink-0 text-faint">Build</dt>
        <dd className="font-mono text-ink">
          {commit}
          {dirty && <span className="ml-1.5 text-amber">uncommitted</span>}
        </dd>
      </div>
      <div className="flex gap-3 py-1">
        <dt className="w-[72px] shrink-0 text-faint">Commit</dt>
        <dd className="min-w-0 leading-[1.45] text-muted">{subject}</dd>
      </div>
      <div className="flex gap-3 py-1">
        <dt className="w-[72px] shrink-0 text-faint">Built</dt>
        <dd className="text-muted">{new Date(builtAt).toLocaleString()}</dd>
      </div>
    </dl>
  )
}
