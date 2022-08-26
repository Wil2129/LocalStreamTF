import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React from 'react';
import {View, StyleSheet} from 'react-native';
import Button from '../components/Button';

const HomeScreen = ({
  navigation: {navigate},
}: {
  navigation: NativeStackNavigationProp<any>;
}) => (
  <View style={styles.container}>
    <Button onPress={() => navigate('Broadcast')} title="Broadcast" />
    <Button onPress={() => navigate('Receive')} title="Receive" />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
});

export default HomeScreen;
