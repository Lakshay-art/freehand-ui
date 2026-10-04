import type { ReactElement, ReactNode, Ref } from "react";
import type { View, ViewProps } from "react-native";
import type { DoodleOptions } from "./index";

export type {
  DoodleOptions,
  DoodlePosition,
  DecorationType,
  LocalizedText,
  NoteOptions,
  ArrowOptions,
  ArrowAnimationOptions,
  DecorationOptions,
  BreakOptions,
} from "./index";

/**
 * `children` (a selector on the web) has no native equivalent, and fonts are
 * never fetched. `fontFamily` names a font linked into the app; omitted, notes
 * use the platform's own handwriting face - Noteworthy on iOS, `casual` on
 * Android.
 */
type NativeDoodleOptions = Omit<DoodleOptions, "children">;

export interface DoodleProps extends NativeDoodleOptions, ViewProps {
  children?: ReactNode;
  /** Skip drawing entirely - useful for feature flags or hiding the notes. */
  disabled?: boolean;
  ref?: Ref<View>;
}

/**
 * Wrap any React Native view in a hand-drawn doodle layer.
 *
 * ```tsx
 * import Doodle from "@aznabee/freehand-ui/native";
 *
 * <Doodle note="start chat" arrow decorations>
 *   <Button />
 * </Doodle>
 * ```
 *
 * The wrapper is a plain `View`; the doodle is drawn with react-native-svg in
 * a touch-transparent layer that never affects layout, but is clipped by an
 * ancestor with `overflow: "hidden"`. The corner radius is taken from `radius`
 * or the wrapper's own `borderRadius` style.
 */
declare const Doodle: (props: DoodleProps) => ReactElement;

export default Doodle;
export { Doodle };
