import React, {FunctionComponent, PropsWithChildren} from 'react';
import {
  Modal,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

const MyModal: FunctionComponent<
  PropsWithChildren<{
    style?: StyleProp<ViewStyle> | undefined;
    visible: boolean;
    onDismiss?: (() => void) | undefined;
    onShow?: ((event: NativeSyntheticEvent<any>) => void) | undefined;
  }>
> = ({children, style, visible, onDismiss, onShow}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onShow={onShow}
      onRequestClose={onDismiss}
      onDismiss={onDismiss}>
      <View style={styles.centeredView}>
        <View style={[styles.modalView, style]}>{children}</View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalView: {
    backgroundColor: 'white',
    borderRadius: 28,
    padding: 24,
    minWidth: 280,
    maxWidth: 560,
    alignItems: 'center',
    justifyContent: 'center',
    // shadowColor: 'black',
    // shadowOffset: {
    //   width: 0,
    //   height: 2,
    // },
    // shadowOpacity: 0.25,
    // shadowRadius: 4,
    elevation: 4,
  },
});

export default MyModal;
