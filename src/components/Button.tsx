import React, {FunctionComponent} from 'react';
import {
  TouchableHighlight,
  StyleSheet,
  Text,
  StyleProp,
  ViewStyle,
  ColorValue,
  TextStyle,
  GestureResponderEvent,
} from 'react-native';

const Button: FunctionComponent<{
  style?: StyleProp<ViewStyle> | undefined;
  onPress: (event: GestureResponderEvent) => void;
  underlayColor?: ColorValue | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  title?: string;
}> = ({style, onPress, underlayColor, titleStyle, title}) => (
  <TouchableHighlight
    style={[styles.button, style]}
    onPress={onPress}
    underlayColor={underlayColor}>
    <Text style={[styles.title, titleStyle]}>{title}</Text>
  </TouchableHighlight>
);

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'mediumslateblue',
    minWidth: 64,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 24,
  },
  title: {
    textAlign: 'center',
    textAlignVertical: 'center',
    alignSelf: 'center',
    color: 'white',
    fontSize: 18,
  },
});

export default Button;
