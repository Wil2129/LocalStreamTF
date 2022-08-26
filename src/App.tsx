import React, {useEffect, useRef} from 'react';

import BroadcastScreen from './screens/RTCBroadcastScreen';
import ReceiveScreen from './screens/RTCReceiveScreen';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeScreen from './screens/HomeScreen';
import ModelContext from './context/ModelContext';
import * as tf from '@tensorflow/tfjs';
// import '@tensorflow/tfjs-react-native';
import '@tensorflow/tfjs-react-native/dist/platform_react_native';
import * as cocoSSd from '@tensorflow-models/coco-ssd';
import {Alert} from 'react-native';

const Stack = createNativeStackNavigator();

function App() {
  const modelRef = useRef<cocoSSd.ObjectDetection | null>(null);

  useEffect(() => {
    (async () => {
      await tf.ready();
      console.log('TF ENV Platform:', tf.env().platform);
      console.log('TF ENV Flags:', tf.env().getFlags());
      try {
        Alert.alert(
          'Loading model...',
          "The coco-ssd model is currently being loaded from Google servers, we'll notify you when that's done.",
        );
        modelRef.current = await cocoSSd.load();
        console.log('Model loaded!');
        Alert.alert(
          'Model loaded!!',
          "The coco-ssd model was successfully loaded.\nYou're ready to go!",
        );
      } catch (error) {
        console.log(error);
      }
    })();

    return () => {
      modelRef.current?.dispose();
    };
  }, []);

  return (
    // <React.StrictMode>
    <SafeAreaProvider>
      <ModelContext.Provider value={modelRef.current}>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Broadcast" component={BroadcastScreen} />
            <Stack.Screen name="Receive" component={ReceiveScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ModelContext.Provider>
    </SafeAreaProvider>
    // </React.StrictMode>
  );
}

export default App;
