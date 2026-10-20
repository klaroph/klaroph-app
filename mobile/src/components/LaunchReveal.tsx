import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import LottieView from 'lottie-react-native'
import splashReveal from '../../assets/lottie/splash_reveal.json'
import { SPLASH_REVEAL_MS } from '../ui/launchReveal'

export function LaunchReveal({ onDone }: { onDone: () => void }) {
  const finished = useRef(false)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])
  function finish() {
    if (finished.current) return
    finished.current = true
    done.current()
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (finished.current) return
      finished.current = true
      done.current()
    }, SPLASH_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <View style={styles.screen} testID="launch-reveal">
      <LottieView
        source={splashReveal}
        autoPlay
        loop={false}
        resizeMode="contain"
        onAnimationFinish={finish}
        style={animationStyle}
        webStyle={animationStyle}
        testID="launch-reveal-lottie"
      />
    </View>
  )
}

const animationStyle = { width: 300, height: 300 * (260 / 740) }

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
