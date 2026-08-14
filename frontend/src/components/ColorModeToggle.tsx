import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COLOR_MODES, type ColorMode } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

const ICONS: Record<ColorMode, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: LaptopIcon,
};

/**
 * Light / dark / follow-the-system.
 *
 * The only theme control this feature ships. The palette and corner-radius
 * pickers belong with the profile screen that can *save* them, because those
 * two are stored on the account; this one is stored on the device and needs
 * nothing but a click.
 */
export const ColorModeToggle = () => {
  const { t } = useTranslation();
  const { colorMode, resolvedColorMode, setColorMode } = useTheme();
  const Icon = ICONS[resolvedColorMode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t('colorMode.label')}>
            <Icon aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={colorMode}
          onValueChange={(value) => setColorMode(value as ColorMode)}
        >
          {COLOR_MODES.map((mode) => {
            const ModeIcon = ICONS[mode];

            return (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <ModeIcon aria-hidden="true" className="size-4" />
                {t(`colorMode.${mode}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
