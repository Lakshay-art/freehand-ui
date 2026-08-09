import type {
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
  Ref,
  RefObject,
} from "react";
import type { DoodleOptions } from "./index";

export type {
  DoodleOptions,
  DoodleInstance,
  DoodlePosition,
  DecorationType,
  NoteOptions,
  ArrowOptions,
  DecorationOptions,
  BreakOptions,
} from "./index";

type DoodleOptionProps = Omit<DoodleOptions, "children">;

export interface DoodleOwnProps extends DoodleOptionProps {
  children?: ReactNode;
  /** Wrapper element to render. Default `"span"`. */
  as?: ElementType;
  /** Skip drawing entirely - useful for reduced-motion or feature flags. */
  disabled?: boolean;
  /**
   * Selector for decorating descendants instead of the wrapper as a whole.
   * Maps to the core's `children` option, which `children` already shadows on
   * a React component.
   */
  childSelector?: string | null;
}

export type DoodleProps<T extends ElementType = "span"> = DoodleOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof DoodleOwnProps> & {
    ref?: Ref<Element>;
  };

/**
 * Wrap any component in a hand-drawn doodle layer.
 *
 * ```tsx
 * <Doodle note="start chat" strokeWidth={2}>
 *   <Button />
 * </Doodle>
 * ```
 *
 * The doodle is drawn around the wrapper as a whole; children are never
 * decorated individually unless you opt in with `childSelector`.
 */
declare const Doodle: <T extends ElementType = "span">(
  props: DoodleProps<T>,
) => JSX.Element;

export default Doodle;
export { Doodle };

/** Draw a doodle around an element you already hold a ref to. */
export function useDoodle(
  ref: RefObject<Element | null>,
  options?: DoodleOptions,
  enabled?: boolean,
): void;
