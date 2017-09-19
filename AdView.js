// @flow

import React, { Component } from 'react';
import {
  TouchableWithoutFeedback,
  Image,
  Dimensions,
  NetInfo,
  WebView,
  LayoutAnimation,
  View,
  Text,
  StatusBar,
  PixelRatio,
} from 'react-native';
import Logger from 'zhike-mobile-logger';
import ZKButton from 'zhike-mobile-button';

const { width:ScreenW, height:ScreenH } = Dimensions.get('window');


type AdInfo = {
  localPath: string,
  link: string,
  startPageDuration?: number,
};

type NavState = {
  title: string,
};

type ParamType = {
  adInfo: AdInfo,
  dismissAction: (action: string, adInfo: AdInfo) => void,
  onHit: (adInfo: AdInfo) => void,
  onWebViewStateChange: (navState: NavState, navigation: any) => void,
  handleLink: (link:string) => bool,
};

type PropTypeReactNavigation = {
  navigation: {
    state: {
      params: ParamType,
    },
  },
};

type PropType = (PropTypeReactNavigation | ParamType) & {
  leftIcon:any,
};

const Header = (props:{ title:string, titleStyle?:any, headerStyle?:any, leftIcon:any, onLeft: () => void }) => {
  const { title, headerStyle, titleStyle, leftIcon, onLeft } = props || {};
  return (
    <View
      style={[
        {
          height:64,
          flexDirection:'row',
          paddingTop:20,
          alignItems:'center',
          paddingLeft:8,
          paddingRight:8,
          justifyContent:'space-between',
          backgroundColor: '#ffffff',
          borderBottomColor: '#f7f8fa',
          borderBottomWidth: 1.0 / PixelRatio.get(),
        },
        headerStyle
      ]}
    >
      <TouchableWithoutFeedback
        onPress={onLeft}
      >
        <Image style={{ width:22, height:22 }} source={leftIcon} />
      </TouchableWithoutFeedback>

      <View style={{ alignSelf:'stretch', flex:1, flexDirection:'row', alignItems:'center' }} >
        <Text style={[{ fontSize: 17, color: 'black', flex: 1, textAlign:'center' }, titleStyle]} >{title}</Text>
      </View>

      <View style={{ width:22, height:22 }} />
    </View>
  )
};

export default class AdView extends Component {
  state: {
    remainingSeconds: number,
    renderWebView: bool,
    navState: Object,
  }
  _handleTap: () => void
  _intervalTimer: any

  constructor(props:PropType) {
    super(props);
    this.state = { remainingSeconds:this._duration(props), renderWebView:false, navState:{} };
    this._handleTap = this._handleTap.bind(this);
  }

  componentDidMount() {
    this._intervalTimer = setInterval(() => {
      if (this._intervalTimer) {
        const cur = this.state.remainingSeconds;
        this.setState({ remainingSeconds:cur - 1 }, () => {
          if (this.state.remainingSeconds === 0) {
            this._quit('timeout');
          }
        });
      }
    }, 1000);
  }

  componentWillUnmount() {
    this._clearTime();
  }

  _adInfo() {
    return (
      this.props.adInfo ||
      (
        this.props.navigation &&
        this.props.navigation.state &&
        this.props.navigation.state.params &&
        this.props.navigation.state.params.adInfo
      )
    );
  }

  _dismissAction() {
    return (
      this.props.dismissAction ||
      (
        this.props.navigation &&
        this.props.navigation.state &&
        this.props.navigation.state.params &&
        this.props.navigation.state.params.dismissAction
      )
    );
  }

  _onHit() {
    return (
      this.props.onHit ||
      (
        this.props.navigation &&
        this.props.navigation.state &&
        this.props.navigation.state.params &&
        this.props.navigation.state.params.onHit
      )
    );
  }

  _handleLink() {
    return (
      this.props.handleLink ||
      (
        this.props.navigation &&
        this.props.navigation.state &&
        this.props.navigation.state.params &&
        this.props.navigation.state.params.handleLink
      ) ||
      (() => false)
    );
  }
  _onWebViewStateChange() {
    return (
      this.props.onWebViewStateChange ||
      (
        this.props.navigation &&
        this.props.navigation.state &&
        this.props.navigation.state.params &&
        this.props.navigation.state.params.onWebViewStateChange
      )
    );
  }

  _handleWebViewStateChange(state) {
    const onWebViewStateChange = this._onWebViewStateChange();
    if (onWebViewStateChange) {
      onWebViewStateChange(state, this.props.navigation);
    }
    this.setState({ navState:state });
  }

  _duration(props) {
    props = props || this.props;
    return (
      props &&
      this._adInfo() &&
      Object.prototype.hasOwnProperty.call(this._adInfo(), 'startPageDuration') &&
      parseInt(this._adInfo().startPageDuration, 10)
    ) || 5;
  }

  _quit(action, ctx) {
    const dismiss = this._dismissAction();
    dismiss && dismiss({ action, adInfo:ctx });
    this._clearTime();
  }

  _clearTime() {
    this._intervalTimer && clearInterval(this._intervalTimer);
    this._intervalTimer = null;
  }

  _handleTap() {
    Logger.info('ad is being hit: ', this._adInfo());
    const onHit = this._onHit();
    onHit && onHit({ adInfo:this._adInfo() });
    const customLinkHandled = this._handleLink()(this._adInfo().link);
    // assume if customLinkHandled, top route will be replaced
    if (!customLinkHandled) {
      if (this._adInfo().link) {
        this._clearTime();
        LayoutAnimation.easeInEaseOut();
        this.setState({ renderWebView:true });
      } else {
        this._quit({ action:'quit-nolink', adInfo:this._adInfo() });
      }
    }
  }

  render() {
    if (!this.props || !this._adInfo() || !this._adInfo().localPath) {
      console.log('no local picture file, return null', this.props);
      return null;
    }
    const adInfo = this._adInfo();
    if (this.state.renderWebView) {
      return (
        // fixme: 不加这一层会导致WebView宽度为0
        <View style={{flex:1, alignSelf:'stretch' }} >
          <StatusBar barStyle={'dark-content'} />
          <Header
            title={this.state.navState.title}
            leftIcon={this.props.leftIcon}
            onLeft={() => this._quit('close', this._adInfo())}
          />
          <WebView
            style={{ flex: 1, alignSelf: 'stretch' }}
            source={{ uri: `${adInfo.link}` }}
            scalesPageToFit={true}
            onNavigationStateChange={state => this._handleWebViewStateChange(state)}
          />
        </View>
      )
    }
    const uri = `file://${this._adInfo().localPath}`;
    const buttonTitleStyle = { fontSize:16, color:'#00b5e9', textAlign:'right' };

    return (
      <TouchableWithoutFeedback
        onPress={this._handleTap}
      >
        <Image
          style={{ width:ScreenW, height:ScreenH, resizeMode:'cover' }}
          source={{ uri }}
        >
          <ZKButton
            style={{ position:'absolute', top:30, right:20, backgroundColor:'transparent' }}
            titleStyle={buttonTitleStyle}
            text={`${this.state.remainingSeconds}s`}
            onPress={() => this._quit('skip')}
          />

          <ZKButton
            style={{ position:'absolute', bottom:30, right:20, backgroundColor:'transparent' }}
            titleStyle={buttonTitleStyle}
            text={'跳过'}
            onPress={() => this._quit('skip')}
          />
        </Image>
      </TouchableWithoutFeedback>
    );
  }
}
