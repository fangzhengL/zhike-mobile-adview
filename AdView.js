
import React, { Component, PropTypes } from 'react';
import {
  TouchableWithoutFeedback,
  Image,
  Dimensions,
  NetInfo,
} from 'react-native';
import RNFS from 'react-native-fs';
import modelManager from 'react-native-model-manager';
import { connect } from 'react-redux';
import Logger from 'zhike-mobile-logger';
import PathUtils from 'zhike-path-utils';
import ErrorMsg from 'zhike-mobile-error';
import Api from 'zhike-mobile-api';
import handleLink from 'zhike-mobile-link-handler';
import ZKButton from 'zhike-mobile-button';

const { width:ScreenW, height:ScreenH } = Dimensions.get('window');
const LAUNCH_ADS_KEY = 'LAUNCH_ADS_KEY';
const ADS_PATH = `${RNFS.LibraryDirectoryPath}/ADs`;

class AdView extends Component {
  _handleTap: () => void

  constructor(props) {
    super(props);
    this.state = { remainingSeconds:this._duration(props), renderWebView:false };
    this._handleTap = this._handleTap.bind(this);
  }

  componentDidMount() {
    this._intervalTimer = setInterval(() => {
      if (this._intervalTimer) {
        console.log('AdView props: ', this.props);
        const cur = this.state.remainingSeconds;
        this.setState({ remainingSeconds:cur - 1 }, () => {
          if (this.state.remainingSeconds === 0) {
            this._quit('timeout');
          }
        });
      }
    }, 1000);
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
      onWebViewStateChange(state);
    }
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
    const customLinkHandled = handleLink(this._adInfo().link);
    // assume if customLinkHandled, top route will be replaced
    if (!customLinkHandled) {
      if (this._adInfo().link) {
        this._clearTime();
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
    if (this.state.renderWebView) {
      return (
        <WebView
          source={{ uri: `${this._adInfo().url}` }}
          scalesPageToFit={true}
          onNavigationStateChange={state => this._handleWebViewStateChange(state)}
        />
      )
    }
    const uri = `file://${ADS_PATH}/${this._adInfo().localPath}`;
    console.log('displaying picture: ', uri);
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

AdView.propTypes = {
  adInfo: PropTypes.shape({
    localPath: PropTypes.string.isRequired,
  }),
  dismissAction: PropTypes.func,
  onHit:PropTypes.func,
  onWebViewStateChange: PropTypes.func,
};

export default AdView;

// /ad:
// /{...data[i], localPath, downloading}

module.exports.refreshAds = function (options:{position:number, target:number} = { position:17, target: 3 }) {
  options && !options.target && (options.target = 3);
  return Api.fetchAdvertisements(['picture', 'link'], options.target, options.position)
  .then(data => Promise.all([module.exports.getAd(), (Array.isArray(data) ? data[0] : data)]))
  .then(([existing, data]) => {
    if (data) {
      Logger.info('did fetch ad: ', data);
      if (!existing || existing.picture !== data.picture || existing.link !== data.link) {
        Logger.info('different ad with existing will override: ', existing, data);
        return modelManager.getAsyncStore()
        .then(store => store.setItem(LAUNCH_ADS_KEY, JSON.stringify(data)))
        .then(() => data);
      } else {
        Logger.info('same ad, no need to override: ', data);
        return existing;
      }
    } else {
      return Promise.reject(null);
    }
  })
  .then((syncData) => {
    if (!syncData) {
      console.error('should not happend, because null data should goto catch block directly');
      return Promise.reject('no existing, must because just fetched none ad, so did remove existing');
    }
    if (!syncData.localPath && !syncData.downloading) {
      syncData.downloading = true;
      return modelManager.getAsyncStore()
      .then(store => store.setItem(LAUNCH_ADS_KEY, JSON.stringify(syncData)))
      .then(() => {
        Logger.info('will download ad.picture: ', syncData);
        return _downloadAd(syncData);
      });
    } else {
      Logger.info('no need to download ad, either because its already downloading, or its already downloaded: ', syncData);
    }
    return syncData;
  })
  .catch((err) => {
    Logger.info('not fetch ad or sth bad happended, remov existing ad .., err: ', err);
    return modelManager.getAsyncStore()
    .then(store => store.removeItem(LAUNCH_ADS_KEY))
    .catch((err) => {
      console.error('failed to remove old ads, error: ', err);
    })
    .then(() => null);
  });
};

module.exports.getAd =  function () {
  return NetInfo.fetch()
  .then((state) => {
    if (state === 'none') {
      return Promise.reject(ErrorMsg.ERR_NETWORK_UNAVAILABLE);
    } else {
      return modelManager.getAsyncStore();
    }
  })
  .then(store => store.getItem(LAUNCH_ADS_KEY))
  .then((adStr) => {
    const ret = JSON.parse(adStr);
    console.log('adInfo: ', ret);
    return ret;
  })
  .catch((err) => {
    Logger.error('failed to getAd, error: ', err);
    return null;
  });
};

function _saveAd(ad) {
  return modelManager.getAsyncStore()
  .then(store => store.setItem(LAUNCH_ADS_KEY, JSON.stringify(ad)))
  .catch((err) => {
    Logger.error('failed to _saveAd, error: ', ad, err);
  });
}

function _downloadAd(ad) {
  const localPath = PathUtils.urlToPath(ad.picture);
  const localPathFull = `${ADS_PATH}/${PathUtils.urlToPath(ad.picture)}`;
  return PathUtils.mkdirForFilePathIfNeeded(localPathFull)
  .then(() => Promise.all([RNFS.downloadFile({
    fromUrl: ad.picture,
    toFile: localPathFull
  }), localPath]))
  .then(([completeInfo, localPath]) => {
    ad.localPath = localPath;
    ad.downloading = false;
    Logger.info('finish download ad, will check consistency: ', ad);
    return Promise.all([module.exports.getAd(), ad]);
  })
  .then(([existing, ad]) => {
    if (!existing || existing.picture  === ad.picture) {
      Logger.info('consistent, will save localPath and downloading srtatus');
      return _saveAd(ad);
    } else {
      Logger.error(
        'too bad, downloaded picture not same with current adinfo, maybe try download too fast with different picture, also will not write back the outdated adinfo'
        );
      return RNFS.unlink(localPathFull).catch(err => console.error('failed to unlink file!', err));
    }
  })
  .catch((err) => {
    ad.localPath = null;
    ad.downloading = false;
    _saveAd(ad);
    console.error('failed to mkdir for ADS_PATH, err: ', ADS_PATH, err);
    console.error('or ... failed to download picure for ad, error: ', ad, err);
    Logger.error('failed to mkdir for ADS_PATH, err: ', ADS_PATH, err);
    Logger.error('or ... failed to download picure for ad, error: ', ad, err);
  });
}

module.exports.getAd()
.then((ad) => {
  if (ad) {
    ad.downloading = false;
    _saveAd(ad);
  }
});
