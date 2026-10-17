// drei <Text> that can't take the scene down. Text loads its font over the
// network and suspends; if that fails it throws. Here a failure just hides
// the label.
import { Suspense, type ComponentProps } from 'react';
import { Text } from '@react-three/drei';
import { ErrorBoundary } from './ErrorBoundary';

export function SceneText(props: ComponentProps<typeof Text>) {
  return (
    <ErrorBoundary name="SceneText">
      <Suspense fallback={null}>
        <Text {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
