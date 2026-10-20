import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
} from 'react-native';

import { spacing } from '../theme/theme';
import { clampScrollOffset, scrollDeltaToReveal } from '../utils/scroll-into-view';

// Space between the focused input and the top of the keyboard.
const KEYBOARD_MARGIN = spacing.lg;

const RevealFocusedInputContext = createContext<() => void>(() => {});

/**
 * For inputs inside a KeyboardAwareScrollView: call the returned function
 * from onFocus, so moving to the next field also keeps it above the keyboard.
 */
export function useRevealFocusedInput(): () => void {
  return useContext(RevealFocusedInputContext);
}

/**
 * A ScrollView that keeps the focused TextInput visible above the software
 * keyboard, without native dependencies (so it works in Expo Go).
 *
 * - iOS: KeyboardAvoidingView with padding, as before.
 * - Android: apps are edge-to-edge (mandatory from Android 16, always on in
 *   Expo), so softwareKeyboardLayoutMode "resize" no longer shrinks the app:
 *   the keyboard is drawn on top of it. KeyboardAvoidingView with padding now
 *   shrinks the scroll view by exactly the part the keyboard covers (0 if the
 *   window did resize after all). The focused input is then scrolled into
 *   view, measured in window coordinates against the keyboard's top edge.
 *   The scroll view's own focus handling cannot do this, because the input
 *   gets focus before the keyboard is shown.
 * - Web: unchanged; the browser handles its on-screen keyboard.
 */
export function KeyboardAwareScrollView({ children, onScroll, onLayout, onContentSizeChange, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  // The keyboard's top edge in window coordinates while it is shown.
  const keyboardTop = useRef<number | null>(null);

  const revealFocusedInput = useCallback(() => {
    if (Platform.OS !== 'android' || keyboardTop.current === null) return;
    const input = TextInput.State.currentlyFocusedInput();
    const scrollView = scrollRef.current;
    if (!input || !scrollView) return;

    scrollView.measureInWindow((_x, scrollTop) => {
      input.measureInWindow((_inputX, inputTop, _width, inputHeight) => {
        if (keyboardTop.current === null) return;
        const delta = scrollDeltaToReveal({
          itemStart: inputTop,
          itemEnd: inputTop + inputHeight,
          visibleStart: scrollTop,
          visibleEnd: Math.min(keyboardTop.current, scrollTop + viewportHeight.current),
          margin: KEYBOARD_MARGIN,
        });
        if (delta === 0) return;
        const target = clampScrollOffset(scrollOffset.current + delta, contentHeight.current, viewportHeight.current);
        scrollView.scrollTo({ y: target, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscriptions = [
      // Also emitted again when the keyboard changes height while open.
      Keyboard.addListener('keyboardDidShow', (event) => {
        keyboardTop.current = event.endCoordinates.screenY;
        revealFocusedInput();
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = null;
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [revealFocusedInput]);

  const handleLayout = (event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    // KeyboardAvoidingView shrinks the scroll view after keyboardDidShow.
    // Only now can it scroll far enough, so try again.
    revealFocusedInput();
    onLayout?.(event);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  const handleContentSizeChange = (width: number, height: number) => {
    contentHeight.current = height;
    onContentSizeChange?.(width, height);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView
        ref={scrollRef}
        // Taps on buttons work immediately even while the keyboard is open.
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        onLayout={handleLayout}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
      >
        <RevealFocusedInputContext.Provider value={revealFocusedInput}>{children}</RevealFocusedInputContext.Provider>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
