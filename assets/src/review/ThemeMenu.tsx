import { observer } from "mobx-react-lite"
import { Palette } from "lucide-react"

import { uiStore } from "../stores/ui-store"
import { THEMES, THEME_LABELS } from "../themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

/** Theme picker: click the swatch to switch the palette that drives every surface. */
export const ThemeMenu = observer(function ThemeMenu() {
  const ui = uiStore

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="pill" size="icon-xs" title="Theme">
            <Palette className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={ui.theme}
          onValueChange={(v) => ui.setTheme(v as (typeof THEMES)[number])}
        >
          {THEMES.map((theme) => (
            <DropdownMenuRadioItem key={theme} value={theme}>
              {THEME_LABELS[theme]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
