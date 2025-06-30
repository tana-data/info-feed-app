const OpenAI = require('openai');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * Whisper API音声認識サービス
 */
class WhisperService {
  constructor() {
    this.openai = null;
    this.tempDir = path.join(__dirname, '../../temp');
    
    // 一時ディレクトリを作成
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * OpenAI クライアントを初期化（WSL2対応強化版）
   */
  initializeOpenAI() {
    if (!this.openai && process.env.OPENAI_API_KEY) {
      const config = {
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 300000, // 5分のタイムアウト（大容量ファイルアップロード対応）
      };

      // WSL2環境での接続改善設定
      const httpAgent = this.createOptimizedHttpAgent();
      if (httpAgent) {
        config.httpAgent = httpAgent;
      }

      this.openai = new OpenAI(config);
    }
    return this.openai;
  }

  /**
   * WSL2環境に最適化されたHTTPエージェントを作成
   * @returns {Object|null} 最適化されたHTTPエージェント
   */
  createOptimizedHttpAgent() {
    try {
      const https = require('https');
      const http = require('http');
      
      // WSL2環境検出
      const isWSL = this.isWSL2Environment();
      
      const agentOptions = {
        keepAlive: true,
        maxSockets: isWSL ? 1 : 5, // WSL2では単一接続
        timeout: 120000, // 2分のタイムアウト（大容量ファイル対応）
        family: 4, // IPv4強制
        lookup: require('dns').lookup, // 明示的DNSルックアップ
      };

      // WSL2特有の設定
      if (isWSL) {
        console.log('🐧 Applying WSL2-specific HTTP agent optimizations...');
        agentOptions.family = 4; // IPv4強制
        agentOptions.maxSockets = 1; // 単一接続のみ
        agentOptions.keepAliveTimeout = 30000;
        agentOptions.keepAliveMsecs = 1000;
        agentOptions.scheduling = 'fifo'; // FIFO scheduling
        
        // WSL2で問題となるTCP設定の調整
        agentOptions.timeout = 180000; // 3分のタイムアウト
      }

      // プロキシ設定の処理
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxyUrl) {
        console.log('🌐 Configuring proxy for OpenAI client:', proxyUrl);
        
        try {
          const url = require('url');
          const proxy = url.parse(proxyUrl);
          
          if (proxy.protocol === 'https:') {
            return new https.Agent({
              ...agentOptions,
              rejectUnauthorized: false // プロキシ環境での証明書検証緩和
            });
          } else {
            return new http.Agent({
              ...agentOptions
            });
          }
        } catch (proxyError) {
          console.error('❌ Proxy configuration failed:', proxyError.message);
          console.log('⚠️  Falling back to direct connection...');
        }
      }

      // プロキシなしの通常設定
      const agent = new https.Agent(agentOptions);
      
      // WSL2環境での追加設定
      if (isWSL) {
        // Connection pooling無効化 (WSL2での接続問題対策)
        agent.maxFreeSockets = 0;
        agent.maxCachedSessions = 0;
      }
      
      console.log(`🔧 HTTP Agent configured: maxSockets=${agentOptions.maxSockets}, family=IPv${agentOptions.family}, timeout=${agentOptions.timeout}ms`);
      
      return agent;
      
    } catch (error) {
      console.error('❌ Failed to create optimized HTTP agent:', error.message);
      return null;
    }
  }

  /**
   * 一般的なConnection Error問題の自動修正を試行
   * @returns {Promise<Object>} 修正試行結果
   */
  async attemptConnectionFixes() {
    const fixes = {
      attempted: [],
      successful: [],
      failed: [],
      recommendations: []
    };

    console.log('🔧 Attempting automatic fixes for connection issues...');

    // 1. DNS問題の修正（WSL2）
    if (this.isWSL2Environment()) {
      try {
        console.log('🔍 Checking DNS configuration...');
        const fs = require('fs');
        const resolvConf = '/etc/resolv.conf';
        
        if (fs.existsSync(resolvConf)) {
          const content = fs.readFileSync(resolvConf, 'utf8');
          
          // Windows DNS転送を検出
          if (content.includes('172.') && !content.includes('8.8.8.8')) {
            fixes.attempted.push('dns_optimization');
            fixes.recommendations.push({
              issue: 'WSL2 using Windows DNS forwarding',
              solution: 'echo "nameserver 8.8.8.8\\nnameserver 1.1.1.1" | sudo tee /etc/resolv.conf',
              autoApplicable: false
            });
          }
        }
      } catch (error) {
        fixes.failed.push('dns_check');
      }
    }

    // 2. IPv6無効化（接続問題対策）
    try {
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec('cat /proc/sys/net/ipv6/conf/all/disable_ipv6', (error, stdout) => {
          if (!error && stdout.trim() === '0') {
            fixes.attempted.push('ipv6_disable');
            fixes.recommendations.push({
              issue: 'IPv6 enabled may cause connection issues',
              solution: 'echo 1 | sudo tee /proc/sys/net/ipv6/conf/all/disable_ipv6',
              autoApplicable: false
            });
          }
          resolve();
        });
      });
    } catch (error) {
      fixes.failed.push('ipv6_check');
    }

    // 3. 環境変数のクリーンアップ
    try {
      const problematicVars = [];
      
      // 問題のある環境変数を検出
      if (process.env.HTTP_PROXY && process.env.HTTP_PROXY.includes('localhost')) {
        problematicVars.push('HTTP_PROXY pointing to localhost');
      }
      
      if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        problematicVars.push('NODE_TLS_REJECT_UNAUTHORIZED disabled');
      }
      
      if (problematicVars.length > 0) {
        fixes.attempted.push('env_cleanup');
        fixes.recommendations.push({
          issue: `Problematic environment variables: ${problematicVars.join(', ')}`,
          solution: 'Review and clean up environment variables',
          autoApplicable: false
        });
      }
    } catch (error) {
      fixes.failed.push('env_check');
    }

    // 4. OpenAI クライアントの再初期化
    try {
      console.log('🔄 Reinitializing OpenAI client with optimized settings...');
      this.openai = null; // 強制リセット
      const client = this.initializeOpenAI();
      
      if (client) {
        fixes.attempted.push('client_reinit');
        fixes.successful.push('client_reinit');
        console.log('✅ OpenAI client reinitialized successfully');
      }
    } catch (error) {
      fixes.attempted.push('client_reinit');
      fixes.failed.push('client_reinit');
    }

    return fixes;
  }

  /**
   * WSL2特化の直接HTTP Whisper API呼び出し
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeAudioFileDirect(audioFilePath, options = {}) {
    console.log('🔧 Using direct HTTP implementation for WSL2 compatibility...');
    
    const fs = require('fs');
    const https = require('https');
    const FormData = require('form-data');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found');
    }

    const fileSizeMB = this.getFileSizeMB(audioFilePath);
    console.log(`📁 Direct upload: ${audioFilePath} (${fileSizeMB.toFixed(2)} MB)`);

    // FormDataを手動構築
    const form = new FormData();
    
    // Buffer読み込み（WSL2でのStream問題回避）
    const fileBuffer = fs.readFileSync(audioFilePath);
    console.log(`📦 File loaded as buffer: ${fileBuffer.length} bytes`);
    
    form.append('file', fileBuffer, {
      filename: require('path').basename(audioFilePath),
      contentType: 'audio/mpeg'
    });
    
    form.append('model', options.model || 'whisper-1');
    form.append('language', options.language || 'ja');
    form.append('response_format', 'text');
    form.append('temperature', (options.temperature || 0.1).toString());

    // WSL2最適化HTTPSオプション
    const requestOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Connection': 'close',  // Keep-Alive無効化
        'User-Agent': 'RSS-Feed-Tool-WSL2/1.0',
        ...form.getHeaders()
      },
      // WSL2特有設定
      family: 4,               // IPv4強制
      timeout: 300000,         // 5分タイムアウト
      rejectUnauthorized: true
    };

    console.log('🌐 Making direct HTTPS request to OpenAI...');
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        console.log(`📡 Response status: ${res.statusCode} ${res.statusMessage}`);
        console.log('📋 Response headers:', JSON.stringify(res.headers, null, 2));
        
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
          console.log(`📥 Received chunk: ${chunk.length} bytes`);
        });
        
        res.on('end', () => {
          const endTime = Date.now();
          const processingTime = endTime - startTime;
          
          console.log(`⏱️  Total processing time: ${processingTime}ms`);
          console.log(`📄 Response data length: ${data.length} characters`);
          
          if (res.statusCode === 200) {
            console.log('✅ Direct HTTP transcription successful');
            resolve(data.trim());
          } else {
            console.error('❌ HTTP Error Response:', data);
            let errorMessage;
            
            try {
              const errorData = JSON.parse(data);
              errorMessage = errorData.error?.message || `HTTP ${res.statusCode}: ${res.statusMessage}`;
            } catch (e) {
              errorMessage = `HTTP ${res.statusCode}: ${data || res.statusMessage}`;
            }
            
            reject(new Error(`Direct HTTP API error: ${errorMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Direct HTTP request error:', {
          name: error.name,
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          address: error.address,
          port: error.port
        });
        
        reject(new Error(`Direct HTTP connection error: ${error.message} (Code: ${error.code})`));
      });

      req.on('timeout', () => {
        console.error('❌ Direct HTTP request timeout');
        req.destroy();
        reject(new Error('Direct HTTP request timeout after 5 minutes'));
      });

      // FormDataをリクエストに書き込み
      console.log('📤 Writing form data to request...');
      form.pipe(req);
      
      form.on('error', (error) => {
        console.error('❌ FormData error:', error);
        reject(new Error(`FormData error: ${error.message}`));
      });
    });
  }

  /**
   * WSL2環境かどうかを判定
   * @returns {boolean} WSL2環境の場合true
   */
  isWSL2Environment() {
    try {
      const fs = require('fs');
      const os = require('os');
      
      if (os.platform() !== 'linux') {
        return false;
      }
      
      if (fs.existsSync('/proc/version')) {
        const version = fs.readFileSync('/proc/version', 'utf8');
        return version.includes('Microsoft') || version.includes('WSL');
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * OpenAI API接続を診断（詳細APIキー検証付き）
   * @returns {Promise<Object>} 診断結果
   */
  async diagnoseOpenAIConnection() {
    const diagnosis = {
      hasApiKey: false,
      apiKeyValid: false,
      networkReachable: false,
      error: null,
      apiKeyDetails: {},
      connectionDetails: {}
    };

    try {
      // 詳細なAPIキー検証
      const apiKeyValidation = await this.validateAPIKeyDetailed();
      diagnosis.hasApiKey = apiKeyValidation.hasApiKey;
      diagnosis.apiKeyDetails = apiKeyValidation;
      
      if (!apiKeyValidation.hasApiKey) {
        diagnosis.error = apiKeyValidation.error;
        return diagnosis;
      }
      
      if (!apiKeyValidation.formatValid) {
        diagnosis.error = apiKeyValidation.error;
        return diagnosis;
      }

      // 簡単なAPI接続テスト
      const client = this.initializeOpenAI();
      if (!client) {
        diagnosis.error = 'Failed to initialize OpenAI client';
        return diagnosis;
      }

      console.log('Testing OpenAI API connection with models.list()...');
      const startTime = Date.now();
      
      // モデル一覧取得で接続テスト（軽量なリクエスト）
      const modelsResponse = await client.models.list();
      const responseTime = Date.now() - startTime;
      
      diagnosis.networkReachable = true;
      diagnosis.apiKeyValid = true;
      diagnosis.connectionDetails = {
        responseTimeMs: responseTime,
        modelsCount: modelsResponse.data?.length || 0,
        testMethod: 'models.list',
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ OpenAI API connection successful (${responseTime}ms, ${modelsResponse.data?.length || 0} models)`);

    } catch (error) {
      console.error('OpenAI connection diagnosis failed:', error.message);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null
      });
      
      diagnosis.error = error.message;
      diagnosis.connectionDetails.error = {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null
      };
      
      if (error.message.includes('timeout') || error.message.includes('connection')) {
        diagnosis.networkReachable = false;
      } else if (error.message.includes('auth') || error.message.includes('key') || 
                 error.response?.status === 401 || error.response?.status === 403) {
        diagnosis.apiKeyValid = false;
      }
    }

    return diagnosis;
  }

  /**
   * APIキーの詳細検証
   * @returns {Promise<Object>} APIキー検証結果
   */
  async validateAPIKeyDetailed() {
    const validation = {
      hasApiKey: false,
      formatValid: false,
      lengthValid: false,
      sourceDetected: 'unknown',
      maskedKey: 'not_found',
      error: null,
      warnings: []
    };

    try {
      // 環境変数からAPIキーを取得
      let apiKey = process.env.OPENAI_API_KEY;
      
      console.log('🔍 Detailed API Key Validation:');
      console.log('================================');
      
      // APIキーの存在確認
      if (!apiKey) {
        console.log('❌ OPENAI_API_KEY not found in environment variables');
        
        // .envファイルから直接読み込み試行
        const envPath = require('path').join(__dirname, '../../.env');
        if (require('fs').existsSync(envPath)) {
          console.log('📄 Checking .env file...');
          const envContent = require('fs').readFileSync(envPath, 'utf8');
          const match = envContent.match(/OPENAI_API_KEY\s*=\s*(.+)/);
          if (match) {
            apiKey = match[1].trim().replace(/^["']|["']$/g, '');
            validation.sourceDetected = '.env_file';
            console.log('✅ Found OPENAI_API_KEY in .env file');
          } else {
            console.log('❌ OPENAI_API_KEY not found in .env file');
          }
        } else {
          console.log('📄 No .env file found');
        }
        
        if (!apiKey) {
          validation.error = 'OPENAI_API_KEY not found in environment variables or .env file';
          return validation;
        }
      } else {
        validation.sourceDetected = 'environment';
        console.log('✅ Found OPENAI_API_KEY in environment variables');
      }
      
      validation.hasApiKey = true;
      
      // APIキーの詳細検証
      console.log(`📏 API Key length: ${apiKey.length} characters`);
      validation.maskedKey = apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4);
      console.log(`🔒 Masked key: ${validation.maskedKey}`);
      
      // 形式チェック
      if (!apiKey.startsWith('sk-')) {
        console.log('❌ Invalid format: API key should start with "sk-"');
        validation.error = 'Invalid OpenAI API key format (should start with sk-)';
        return validation;
      }
      validation.formatValid = true;
      console.log('✅ Format valid: starts with "sk-"');
      
      // 長さチェック（通常のOpenAI APIキーは50文字程度）
      if (apiKey.length < 45 || apiKey.length > 60) {
        console.log(`⚠️  Unusual length: ${apiKey.length} characters (typical: 45-60)`);
        validation.warnings.push(`Unusual key length: ${apiKey.length} characters`);
      } else {
        validation.lengthValid = true;
        console.log('✅ Length appears valid');
      }
      
      // 空白や制御文字のチェック
      if (apiKey !== apiKey.trim()) {
        console.log('⚠️  API key has leading/trailing whitespace');
        validation.warnings.push('API key has leading/trailing whitespace');
      }
      
      if (/[\r\n\t]/.test(apiKey)) {
        console.log('⚠️  API key contains control characters (newlines, tabs)');
        validation.warnings.push('API key contains control characters');
      }
      
      console.log(`📊 Source: ${validation.sourceDetected}`);
      if (validation.warnings.length > 0) {
        console.log(`⚠️  Warnings: ${validation.warnings.length}`);
        validation.warnings.forEach(warning => console.log(`   - ${warning}`));
      }
      
    } catch (error) {
      console.error('API key validation failed:', error.message);
      validation.error = `API key validation failed: ${error.message}`;
    }

    return validation;
  }

  /**
   * WSL2環境用の詳細ネットワーク診断
   * @returns {Promise<Object>} 詳細ネットワーク診断結果
   */
  async diagnoseNetworkLayered() {
    const diagnosis = {
      environment: {
        isWSL: false,
        platform: require('os').platform(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      },
      dns: { success: false, details: {} },
      tcp: { success: false, details: {} },
      https: { success: false, details: {} },
      openaiApi: { success: false, details: {} },
      whisperApi: { success: false, details: {} },
      proxy: { detected: false, details: {} },
      recommendations: []
    };

    // WSL環境検出
    try {
      const fs = require('fs');
      if (fs.existsSync('/proc/version')) {
        const version = fs.readFileSync('/proc/version', 'utf8');
        diagnosis.environment.isWSL = version.includes('Microsoft') || version.includes('WSL');
        diagnosis.environment.wslDetails = version.trim();
      }
    } catch (error) {
      // WSL検出失敗は無視
    }

    // 1. DNS解決テスト
    try {
      const dns = require('dns').promises;
      const startTime = Date.now();
      const addresses = await dns.resolve4('api.openai.com');
      const resolveTime = Date.now() - startTime;
      
      diagnosis.dns.success = true;
      diagnosis.dns.details = {
        addresses: addresses,
        resolveTimeMs: resolveTime,
        method: 'IPv4'
      };

      // IPv6も試行
      try {
        const ipv6Addresses = await dns.resolve6('api.openai.com');
        diagnosis.dns.details.ipv6Addresses = ipv6Addresses;
      } catch (ipv6Error) {
        diagnosis.dns.details.ipv6Error = ipv6Error.message;
      }

    } catch (error) {
      diagnosis.dns.details.error = error.message;
      diagnosis.dns.details.code = error.code;
    }

    // 2. TCP接続テスト
    if (diagnosis.dns.success) {
      try {
        const net = require('net');
        const tcpStartTime = Date.now();
        
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          
          socket.setTimeout(10000); // 10秒タイムアウト
          
          socket.connect(443, 'api.openai.com', () => {
            const connectTime = Date.now() - tcpStartTime;
            diagnosis.tcp.success = true;
            diagnosis.tcp.details = {
              connectTimeMs: connectTime,
              localAddress: socket.localAddress,
              localPort: socket.localPort,
              remoteAddress: socket.remoteAddress,
              remotePort: socket.remotePort
            };
            socket.destroy();
            resolve();
          });
          
          socket.on('error', (error) => {
            diagnosis.tcp.details.error = error.message;
            diagnosis.tcp.details.code = error.code;
            reject(error);
          });
          
          socket.on('timeout', () => {
            diagnosis.tcp.details.error = 'TCP connection timeout';
            socket.destroy();
            reject(new Error('TCP connection timeout'));
          });
        });

      } catch (error) {
        // TCP接続エラーは既にdetailsに記録済み
      }
    }

    // 3. HTTPS接続テスト（basic + with curl fallback）
    if (diagnosis.tcp.success) {
      try {
        const https = require('https');
        const httpsStartTime = Date.now();
        
        await new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/models',
            method: 'HEAD',
            timeout: 15000,
            headers: {
              'User-Agent': 'RSS-Feed-Tool/1.0'
            }
          };

          const req = https.request(options, (res) => {
            const httpsTime = Date.now() - httpsStartTime;
            diagnosis.https.success = true;
            diagnosis.https.details = {
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              responseTimeMs: httpsTime,
              tlsVersion: res.socket?.getProtocol?.() || 'unknown',
              method: 'native_https'
            };
            resolve();
          });

          req.on('error', (error) => {
            diagnosis.https.details.error = error.message;
            diagnosis.https.details.code = error.code;
            reject(error);
          });

          req.on('timeout', () => {
            diagnosis.https.details.error = 'HTTPS request timeout';
            req.destroy();
            reject(new Error('HTTPS request timeout'));
          });

          req.end();
        });

      } catch (error) {
        console.log('Native HTTPS failed, trying curl fallback...');
        
        // curlフォールバック
        try {
          const { exec } = require('child_process');
          const curlStartTime = Date.now();
          
          await new Promise((resolve, reject) => {
            exec('curl -I -s -m 15 https://api.openai.com/v1/models', 
              (error, stdout, stderr) => {
                if (error) {
                  diagnosis.https.details.curlError = error.message;
                  reject(error);
                  return;
                }
                
                const curlTime = Date.now() - curlStartTime;
                const statusMatch = stdout.match(/HTTP\/[\d\.]+\s+(\d+)\s+(.+)/);
                
                if (statusMatch) {
                  diagnosis.https.success = true;
                  diagnosis.https.details = {
                    statusCode: parseInt(statusMatch[1]),
                    statusMessage: statusMatch[2].trim(),
                    responseTimeMs: curlTime,
                    method: 'curl_fallback',
                    rawResponse: stdout.split('\n').slice(0, 5).join('\n')
                  };
                  console.log('✅ curl fallback successful');
                } else {
                  diagnosis.https.details.curlOutput = stdout;
                }
                
                resolve();
              }
            );
          });
        } catch (curlError) {
          diagnosis.https.details.curlError = curlError.message;
        }
      }
    }

    // 4. OpenAI API テスト
    if (diagnosis.https.success) {
      try {
        const basicDiagnosis = await this.diagnoseOpenAIConnection();
        diagnosis.openaiApi.success = basicDiagnosis.apiKeyValid && basicDiagnosis.networkReachable;
        diagnosis.openaiApi.details = basicDiagnosis;
      } catch (error) {
        diagnosis.openaiApi.details.error = error.message;
      }
    }

    // 5. Whisper API テスト
    if (diagnosis.openaiApi.success) {
      try {
        const whisperDiagnosis = await this.diagnoseWhisperAPIConnection();
        diagnosis.whisperApi.success = whisperDiagnosis.canUploadFiles;
        diagnosis.whisperApi.details = whisperDiagnosis;
      } catch (error) {
        diagnosis.whisperApi.details.error = error.message;
      }
    }

    // プロキシ設定検出と詳細分析
    diagnosis.proxy = await this.diagnoseProxyAndFirewall();

    // 基本ネットワークテスト
    diagnosis.basicNetworkTests = await this.runBasicNetworkTests();

    // 推奨事項生成
    diagnosis.recommendations = this.generateNetworkRecommendations(diagnosis);

    return diagnosis;
  }

  /**
   * 基本ネットワーク接続テスト (ping, nslookup, curl)
   * @returns {Promise<Object>} 基本ネットワークテスト結果
   */
  async runBasicNetworkTests() {
    const tests = {
      ping: { success: false, details: {} },
      nslookup: { success: false, details: {} },
      curl: { success: false, details: {} },
      environment: {}
    };

    const { exec } = require('child_process');
    
    console.log('🔍 Running basic network connectivity tests...');
    
    // 環境変数の確認
    tests.environment = {
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || 'not_set',
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || 'not_set',
      noProxy: process.env.NO_PROXY || process.env.no_proxy || 'not_set',
      nodeEnv: process.env.NODE_ENV || 'not_set'
    };

    // 1. Ping テスト
    try {
      console.log('📡 Testing ping to api.openai.com...');
      await new Promise((resolve, reject) => {
        exec('ping -c 3 api.openai.com', { timeout: 10000 }, (error, stdout, stderr) => {
          if (error) {
            tests.ping.details = { error: error.message, stderr: stderr };
            console.log('❌ Ping failed:', error.message);
          } else {
            tests.ping.success = true;
            tests.ping.details = { output: stdout };
            
            // RTT抽出
            const rttMatch = stdout.match(/time=(\d+\.?\d*)\s*ms/g);
            if (rttMatch) {
              const rtts = rttMatch.map(m => parseFloat(m.match(/time=(\d+\.?\d*)/)[1]));
              tests.ping.details.avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
            }
            console.log(`✅ Ping successful (avg RTT: ${tests.ping.details.avgRtt?.toFixed(1)}ms)`);
          }
          resolve();
        });
      });
    } catch (error) {
      tests.ping.details = { error: error.message };
    }

    // 2. DNS lookup テスト
    try {
      console.log('🔍 Testing DNS resolution...');
      await new Promise((resolve, reject) => {
        exec('nslookup api.openai.com', { timeout: 10000 }, (error, stdout, stderr) => {
          if (error) {
            tests.nslookup.details = { error: error.message, stderr: stderr };
            console.log('❌ DNS lookup failed:', error.message);
          } else {
            tests.nslookup.success = true;
            tests.nslookup.details = { output: stdout };
            
            // IPアドレス抽出
            const ipMatches = stdout.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/g);
            if (ipMatches) {
              tests.nslookup.details.addresses = ipMatches.map(m => m.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/)[1]);
            }
            console.log(`✅ DNS lookup successful (${tests.nslookup.details.addresses?.length || 0} addresses)`);
          }
          resolve();
        });
      });
    } catch (error) {
      tests.nslookup.details = { error: error.message };
    }

    // 3. curl テスト
    try {
      console.log('🌐 Testing HTTPS connectivity with curl...');
      await new Promise((resolve, reject) => {
        const curlCmd = 'curl -I -s -m 10 -w "time_total:%{time_total}\\nhttp_code:%{http_code}\\n" https://api.openai.com/v1/models';
        exec(curlCmd, { timeout: 15000 }, (error, stdout, stderr) => {
          if (error) {
            tests.curl.details = { error: error.message, stderr: stderr };
            console.log('❌ curl test failed:', error.message);
          } else {
            tests.curl.success = true;
            tests.curl.details = { output: stdout };
            
            // レスポンス時間とHTTPコード抽出
            const timeMatch = stdout.match(/time_total:([\d\.]+)/);
            const codeMatch = stdout.match(/http_code:(\d+)/);
            
            if (timeMatch) tests.curl.details.responseTime = parseFloat(timeMatch[1]);
            if (codeMatch) tests.curl.details.httpCode = parseInt(codeMatch[1]);
            
            console.log(`✅ curl test successful (${tests.curl.details.httpCode}, ${tests.curl.details.responseTime}s)`);
          }
          resolve();
        });
      });
    } catch (error) {
      tests.curl.details = { error: error.message };
    }

    return tests;
  }

  /**
   * ネットワーク診断結果に基づく推奨事項生成
   * @param {Object} diagnosis - 診断結果
   * @returns {Array} 推奨事項リスト
   */
  generateNetworkRecommendations(diagnosis) {
    const recommendations = [];

    if (!diagnosis.dns.success) {
      recommendations.push({
        issue: 'DNS resolution failed',
        solution: 'Check DNS settings. In WSL2, try: echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf',
        priority: 'critical',
        wsl2Specific: diagnosis.environment.isWSL
      });
    }

    if (!diagnosis.tcp.success && diagnosis.dns.success) {
      recommendations.push({
        issue: 'TCP connection failed',
        solution: diagnosis.environment.isWSL 
          ? 'WSL2 firewall issue. Check Windows Defender settings and WSL network configuration'
          : 'Check firewall settings and network connectivity',
        priority: 'critical',
        wsl2Specific: diagnosis.environment.isWSL
      });
    }

    if (!diagnosis.https.success && diagnosis.tcp.success) {
      recommendations.push({
        issue: 'HTTPS connection failed',
        solution: 'TLS/SSL configuration issue. Check proxy settings and certificate store',
        priority: 'high',
        wsl2Specific: false
      });
    }

    if (diagnosis.proxy.detected) {
      recommendations.push({
        issue: 'Proxy configuration detected',
        solution: 'Proxy may interfere with file uploads. Consider bypassing proxy for api.openai.com',
        priority: 'medium',
        wsl2Specific: false
      });
    }

    if (diagnosis.environment.isWSL && !diagnosis.whisperApi.success) {
      recommendations.push({
        issue: 'WSL2 large file upload issue',
        solution: 'WSL2 may have issues with large file uploads. Try: 1) Use smaller files, 2) Update WSL2, 3) Check Windows network adapter settings',
        priority: 'high',
        wsl2Specific: true
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        issue: 'No network issues detected',
        solution: 'Network connectivity appears normal. The issue may be transient or API-specific.',
        priority: 'info',
        wsl2Specific: false
      });
    }

    return recommendations;
  }

  /**
   * プロキシとファイアウォール設定の詳細診断
   * @returns {Promise<Object>} プロキシ・ファイアウォール診断結果
   */
  async diagnoseProxyAndFirewall() {
    const diagnosis = {
      detected: false,
      configured: false,
      working: false,
      details: {},
      firewall: {},
      wsl2Specific: {},
      recommendations: []
    };

    // 環境変数からプロキシ設定を取得
    diagnosis.details = {
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
      noProxy: process.env.NO_PROXY || process.env.no_proxy,
      allProxy: process.env.ALL_PROXY || process.env.all_proxy
    };

    diagnosis.configured = !!(diagnosis.details.httpProxy || diagnosis.details.httpsProxy || diagnosis.details.allProxy);
    diagnosis.detected = diagnosis.configured;

    // プロキシ設定の詳細分析
    if (diagnosis.configured) {
      const proxyUrl = diagnosis.details.httpsProxy || diagnosis.details.httpProxy || diagnosis.details.allProxy;
      try {
        const url = new URL(proxyUrl);
        diagnosis.details.proxyHost = url.hostname;
        diagnosis.details.proxyPort = url.port;
        diagnosis.details.proxyProtocol = url.protocol;
        diagnosis.details.hasAuth = !!(url.username || url.password);
      } catch (error) {
        diagnosis.details.parseError = error.message;
      }

      // プロキシ経由でのテスト接続
      try {
        const https = require('https');
        const url = require('url');
        
        await new Promise((resolve, reject) => {
          const proxyUrl = diagnosis.details.httpsProxy || diagnosis.details.httpProxy;
          const targetUrl = 'https://api.openai.com/v1/models';
          
          const options = {
            method: 'HEAD',
            timeout: 10000
          };

          if (proxyUrl) {
            const proxy = url.parse(proxyUrl);
            options.hostname = proxy.hostname;
            options.port = proxy.port;
            options.path = targetUrl;
            options.headers = {
              'Host': 'api.openai.com',
              'User-Agent': 'RSS-Feed-Tool/1.0'
            };
            
            if (proxy.auth) {
              options.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64');
            }
          }

          const req = https.request(options, (res) => {
            diagnosis.working = res.statusCode < 400;
            diagnosis.details.proxyTestStatus = res.statusCode;
            resolve();
          });

          req.on('error', (error) => {
            diagnosis.details.proxyTestError = error.message;
            resolve(); // エラーでもresolveしてテストを続行
          });

          req.on('timeout', () => {
            diagnosis.details.proxyTestError = 'Proxy connection timeout';
            resolve();
          });

          req.end();
        });

      } catch (error) {
        diagnosis.details.proxyTestError = error.message;
      }
    }

    // WSL2特有の診断
    const isWSL = require('os').platform() === 'linux' && require('fs').existsSync('/proc/version');
    if (isWSL) {
      try {
        const version = require('fs').readFileSync('/proc/version', 'utf8');
        if (version.includes('Microsoft') || version.includes('WSL')) {
          // WSL2のネットワーク設定確認
          diagnosis.wsl2Specific = await this.diagnoseWSL2Network();
        }
      } catch (error) {
        diagnosis.wsl2Specific.error = error.message;
      }
    }

    // Windows Defender/ファイアウォール検出（WSL環境）
    if (isWSL) {
      try {
        // WSLからWindowsの設定を確認（限定的）
        const { exec } = require('child_process');
        
        await new Promise((resolve) => {
          exec('netstat -rn | grep "^0.0.0.0"', (error, stdout) => {
            if (!error && stdout) {
              diagnosis.firewall.defaultGateway = stdout.trim().split(/\s+/)[1];
            }
            resolve();
          });
        });

        // Windows側のファイアウォール状態をチェック（可能な範囲で）
        await new Promise((resolve) => {
          exec('powershell.exe -Command "Get-NetFirewallProfile | Select-Object -Property Name,Enabled"', 
            { timeout: 5000 }, (error, stdout) => {
            if (!error && stdout) {
              diagnosis.firewall.windowsFirewallInfo = stdout.trim();
            }
            resolve();
          });
        });

      } catch (error) {
        diagnosis.firewall.detectionError = error.message;
      }
    }

    // 推奨事項生成
    diagnosis.recommendations = this.generateProxyFirewallRecommendations(diagnosis);

    return diagnosis;
  }

  /**
   * WSL2特有のネットワーク診断
   * @returns {Promise<Object>} WSL2ネットワーク診断結果
   */
  async diagnoseWSL2Network() {
    const wslDiagnosis = {
      networking: {},
      dns: {},
      mtu: {},
      ipv6: {},
      recommendations: []
    };

    try {
      const { exec } = require('child_process');
      const fs = require('fs');

      // ネットワークインターフェース確認
      await new Promise((resolve) => {
        exec('ip addr show', (error, stdout) => {
          if (!error) {
            wslDiagnosis.networking.interfaces = stdout;
            // vEthernet関連の情報を抽出
            const vethMatch = stdout.match(/inet (\d+\.\d+\.\d+\.\d+).*eth0/);
            if (vethMatch) {
              wslDiagnosis.networking.wslIP = vethMatch[1];
            }
          }
          resolve();
        });
      });

      // DNS設定確認
      if (fs.existsSync('/etc/resolv.conf')) {
        wslDiagnosis.dns.resolveConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const nameservers = wslDiagnosis.dns.resolveConf.match(/nameserver\s+(\S+)/g);
        if (nameservers) {
          wslDiagnosis.dns.nameservers = nameservers.map(ns => ns.split(/\s+/)[1]);
        }
      }

      // MTU設定確認
      await new Promise((resolve) => {
        exec('ip link show eth0 | grep mtu', (error, stdout) => {
          if (!error) {
            const mtuMatch = stdout.match(/mtu (\d+)/);
            if (mtuMatch) {
              wslDiagnosis.mtu.value = parseInt(mtuMatch[1]);
              wslDiagnosis.mtu.optimal = wslDiagnosis.mtu.value >= 1500;
            }
          }
          resolve();
        });
      });

      // IPv6設定確認
      await new Promise((resolve) => {
        exec('cat /proc/sys/net/ipv6/conf/all/disable_ipv6', (error, stdout) => {
          if (!error) {
            wslDiagnosis.ipv6.disabled = stdout.trim() === '1';
          }
          resolve();
        });
      });

    } catch (error) {
      wslDiagnosis.error = error.message;
    }

    return wslDiagnosis;
  }

  /**
   * プロキシ・ファイアウォール診断結果に基づく推奨事項生成
   * @param {Object} diagnosis - プロキシ・ファイアウォール診断結果
   * @returns {Array} 推奨事項リスト
   */
  generateProxyFirewallRecommendations(diagnosis) {
    const recommendations = [];

    if (diagnosis.configured && !diagnosis.working) {
      recommendations.push({
        issue: 'Proxy configured but not working',
        solution: 'Check proxy credentials and connectivity. Try temporarily disabling proxy: unset HTTPS_PROXY HTTP_PROXY',
        priority: 'high'
      });
    }

    if (diagnosis.configured && diagnosis.details.hasAuth) {
      recommendations.push({
        issue: 'Proxy with authentication may cause file upload issues',
        solution: 'Consider bypassing proxy for api.openai.com or use proxy without authentication',
        priority: 'medium'
      });
    }

    if (diagnosis.wsl2Specific?.dns?.nameservers?.includes('172.')) {
      recommendations.push({
        issue: 'WSL2 using Windows DNS forwarding',
        solution: 'Try using public DNS: echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf',
        priority: 'medium'
      });
    }

    if (diagnosis.wsl2Specific?.mtu?.value && diagnosis.wsl2Specific.mtu.value < 1500) {
      recommendations.push({
        issue: 'Low MTU may cause large file upload issues',
        solution: `Current MTU: ${diagnosis.wsl2Specific.mtu.value}. Try: sudo ip link set dev eth0 mtu 1500`,
        priority: 'medium'
      });
    }

    if (diagnosis.firewall?.windowsFirewallInfo?.includes('True')) {
      recommendations.push({
        issue: 'Windows Firewall is enabled',
        solution: 'Add exception for WSL2 or Node.js in Windows Defender Firewall',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Whisper API専用の接続診断（ファイルアップロード機能をテスト）
   * @returns {Promise<Object>} Whisper API専用診断結果
   */
  async diagnoseWhisperAPIConnection() {
    const diagnosis = {
      hasApiKey: false,
      apiKeyValid: false,
      networkReachable: false,
      whisperEndpointReachable: false,
      canUploadFiles: false,
      error: null,
      details: {}
    };

    try {
      // 基本的な接続診断を先に実行
      const basicDiagnosis = await this.diagnoseOpenAIConnection();
      diagnosis.hasApiKey = basicDiagnosis.hasApiKey;
      diagnosis.apiKeyValid = basicDiagnosis.apiKeyValid;
      diagnosis.networkReachable = basicDiagnosis.networkReachable;
      
      if (!basicDiagnosis.hasApiKey || !basicDiagnosis.apiKeyValid || !basicDiagnosis.networkReachable) {
        diagnosis.error = basicDiagnosis.error;
        return diagnosis;
      }

      // Whisper API専用のテスト - 小さなサンプル音声ファイルを作成してテスト
      const client = this.initializeOpenAI();
      console.log('Testing Whisper API endpoint connectivity...');
      
      // 極小のダミー音声ファイル（実際には無音の短いWAVファイル）を作成
      const testAudioPath = await this.createTestAudioFile();
      
      try {
        // 実際にWhisper APIを呼び出してみる（最小ファイルで）
        console.log('Attempting Whisper API call with test file...');
        await client.audio.transcriptions.create({
          file: fs.createReadStream(testAudioPath),
          model: 'whisper-1',
          language: 'ja',
          response_format: 'text'
        });
        
        diagnosis.whisperEndpointReachable = true;
        diagnosis.canUploadFiles = true;
        diagnosis.details.testResult = 'Whisper API call successful';
        
      } catch (whisperError) {
        diagnosis.details.whisperError = {
          message: whisperError.message,
          code: whisperError.code,
          status: whisperError.response?.status,
          statusText: whisperError.response?.statusText
        };
        
        // Whisper API特有のエラー分析
        if (whisperError.message.includes('Invalid file format') || 
            whisperError.message.includes('audio') ||
            whisperError.response?.status === 400) {
          // ファイル形式エラーは接続は成功している証拠
          diagnosis.whisperEndpointReachable = true;
          diagnosis.canUploadFiles = true;
          diagnosis.details.testResult = 'Whisper API reachable (file format test error expected)';
        } else if (whisperError.message.includes('timeout') || 
                   whisperError.message.includes('connection') ||
                   whisperError.code === 'ECONNRESET' ||
                   whisperError.code === 'ETIMEDOUT') {
          diagnosis.whisperEndpointReachable = false;
          diagnosis.error = `Whisper API connection failed: ${whisperError.message}`;
        } else {
          diagnosis.whisperEndpointReachable = true;
          diagnosis.error = `Whisper API error: ${whisperError.message}`;
        }
      } finally {
        // テストファイルをクリーンアップ
        this.cleanupTempFile(testAudioPath);
      }

    } catch (error) {
      console.error('Whisper API diagnosis failed:', error.message);
      diagnosis.error = error.message;
      diagnosis.details.generalError = {
        message: error.message,
        code: error.code,
        stack: error.stack
      };
    }

    return diagnosis;
  }

  /**
   * 小チャンクアップロードテスト（大容量ファイル前の事前テスト）
   * @returns {Promise<boolean>} アップロード可能かどうか
   */
  async testSmallChunkUpload() {
    console.log('Testing small chunk upload capability...');
    
    try {
      // 小さなテストファイル（約1MB）を作成
      const testFilePath = await this.createSmallTestAudioFile();
      
      const client = this.initializeOpenAI();
      
      // 実際にアップロードテスト（転写は不要、アップロードのみテスト）
      const startTime = Date.now();
      
      try {
        await client.audio.transcriptions.create({
          file: require('fs').createReadStream(testFilePath),
          model: 'whisper-1',
          response_format: 'text'
        });
        
        const uploadTime = Date.now() - startTime;
        console.log(`Small chunk upload successful: ${uploadTime}ms`);
        
        this.cleanupTempFile(testFilePath);
        return true;
        
      } catch (uploadError) {
        this.cleanupTempFile(testFilePath);
        
        // ファイル形式エラーは接続成功とみなす
        if (uploadError.message.includes('Invalid file format') ||
            uploadError.message.includes('audio') ||
            uploadError.response?.status === 400) {
          console.log('Small chunk upload reached API (file format error expected)');
          return true;
        }
        
        // 接続エラーの場合は失敗
        if (uploadError.message.includes('timeout') ||
            uploadError.message.includes('connection') ||
            uploadError.code === 'ECONNRESET' ||
            uploadError.code === 'ETIMEDOUT') {
          console.error('Small chunk upload failed with connection error:', uploadError.message);
          return false;
        }
        
        // その他のエラーは成功とみなす（API到達は確認）
        console.log('Small chunk upload reached API with error:', uploadError.message);
        return true;
      }
      
    } catch (error) {
      console.error('Small chunk test setup failed:', error.message);
      return false;
    }
  }

  /**
   * 小さなテスト用音声ファイルを作成（約1MB）
   * @returns {Promise<string>} 作成されたテストファイルのパス
   */
  async createSmallTestAudioFile() {
    const testFilePath = require('path').join(this.tempDir, `test_small_${Date.now()}.wav`);
    
    // 約1MBのWAVファイル（8000Hz、約2分の無音）
    const sampleRate = 8000;
    const durationSeconds = 120; // 2分
    const bytesPerSample = 2;
    const totalSamples = sampleRate * durationSeconds;
    const dataSize = totalSamples * bytesPerSample;
    
    const wavHeader = Buffer.alloc(44);
    
    // WAVヘッダー作成
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(dataSize + 36, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // PCM format size
    wavHeader.writeUInt16LE(1, 20);  // PCM format
    wavHeader.writeUInt16LE(1, 22);  // mono
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * bytesPerSample, 28);
    wavHeader.writeUInt16LE(bytesPerSample, 32);
    wavHeader.writeUInt16LE(16, 34); // bits per sample
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataSize, 40);
    
    // 無音データ（約1MB）
    const silenceData = Buffer.alloc(dataSize, 0);
    
    const fullWavData = Buffer.concat([wavHeader, silenceData]);
    
    require('fs').writeFileSync(testFilePath, fullWavData);
    console.log(`Created small test audio file: ${testFilePath} (${(fullWavData.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return testFilePath;
  }

  /**
   * テスト用の極小音声ファイルを作成
   * @returns {Promise<string>} 作成されたテストファイルのパス
   */
  async createTestAudioFile() {
    const testFilePath = path.join(this.tempDir, `test_audio_${Date.now()}.wav`);
    
    // 極小のWAVファイルヘッダー（44バイト）+ 無音データ（約0.1秒）
    // これは合計で約500バイト程度の極小ファイル
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0xE4, 0x01, 0x00, 0x00, // file size - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6D, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // chunk size
      0x01, 0x00,             // PCM format
      0x01, 0x00,             // mono
      0x40, 0x1F, 0x00, 0x00, // 8000 Hz sample rate
      0x80, 0x3E, 0x00, 0x00, // byte rate
      0x02, 0x00,             // block align
      0x10, 0x00,             // 16 bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0xC0, 0x01, 0x00, 0x00  // data size
    ]);
    
    // 無音データ（約0.1秒分）
    const silenceData = Buffer.alloc(800, 0); // 8000Hz * 0.1sec * 2bytes = 1600, but keep it smaller
    
    const fullWavData = Buffer.concat([wavHeader, silenceData]);
    
    fs.writeFileSync(testFilePath, fullWavData);
    console.log(`Created test audio file: ${testFilePath} (${fullWavData.length} bytes)`);
    
    return testFilePath;
  }

  /**
   * 音声ファイルをダウンロード
   * @param {string} audioUrl - 音声ファイルのURL
   * @param {string} filename - 保存するファイル名
   * @returns {Promise<string>} ダウンロードしたファイルのパス
   */
  async downloadAudioFile(audioUrl, filename) {
    const filePath = path.join(this.tempDir, filename);
    
    try {
      const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'stream',
        timeout: 60000, // 60秒のタイムアウト
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS-Feed-Tool/1.0)'
        }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Audio file downloaded: ${filePath}`);
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Audio download error:', error.message);
      throw new Error(`Failed to download audio file: ${error.message}`);
    }
  }

  /**
   * 音声ファイルのサイズをチェック
   * @param {string} filePath - ファイルパス
   * @returns {number} ファイルサイズ（MB）
   */
  getFileSizeMB(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
  }

  /**
   * 音声ファイルを指定時間で分割（バイトベース近似）
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {number} durationMinutes - 分割時間（分）
   * @returns {Promise<string>} 分割されたファイルのパス
   */
  async splitAudioFile(audioFilePath, durationMinutes = 20) {
    const timestamp = Date.now();
    const ext = path.extname(audioFilePath);
    const outputPath = path.join(this.tempDir, `split_${timestamp}${ext}`);
    
    try {
      // FFmpegが利用可能かチェック
      const hasFFmpeg = await this.checkFFmpegAvailability();
      
      if (hasFFmpeg) {
        return await this.splitWithFFmpeg(audioFilePath, outputPath, durationMinutes);
      } else {
        return await this.splitWithByteApproximation(audioFilePath, outputPath, durationMinutes);
      }
    } catch (error) {
      console.error('Audio splitting failed:', error.message);
      throw new Error('Failed to split audio file');
    }
  }

  /**
   * FFmpegの利用可能性をチェック
   * @returns {Promise<boolean>} FFmpegが利用可能かどうか
   */
  async checkFFmpegAvailability() {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('ffmpeg -version', (error) => {
          resolve(!error);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * FFmpegを使用した音声分割
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {number} durationMinutes - 分割時間（分）
   * @returns {Promise<string>} 分割されたファイルのパス
   */
  async splitWithFFmpeg(inputPath, outputPath, durationMinutes) {
    const { exec } = require('child_process');
    const durationSeconds = durationMinutes * 60;
    
    return new Promise((resolve, reject) => {
      const command = `ffmpeg -i "${inputPath}" -t ${durationSeconds} -c copy "${outputPath}" -y`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('FFmpeg error:', error.message);
          reject(new Error(`FFmpeg splitting failed: ${error.message}`));
          return;
        }
        
        console.log(`Audio file split with FFmpeg to first ${durationMinutes} minutes: ${outputPath}`);
        resolve(outputPath);
      });
    });
  }

  /**
   * バイト近似による音声分割（FFmpeg未使用時のフォールバック）
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {number} durationMinutes - 分割時間（分）
   * @returns {Promise<string>} 分割されたファイルのパス
   */
  async splitWithByteApproximation(inputPath, outputPath, durationMinutes) {
    return new Promise((resolve, reject) => {
      try {
        const inputStats = fs.statSync(inputPath);
        const inputSizeMB = inputStats.size / (1024 * 1024);
        
        // 音声ファイルの平均的な継続時間を推定（Podcastは通常30-90分）
        const estimatedTotalMinutes = Math.max(30, inputSizeMB * 1.5); // 1.5分/MBの概算
        const targetRatio = durationMinutes / estimatedTotalMinutes;
        const targetBytes = Math.floor(inputStats.size * targetRatio);
        
        // 最大20MBに制限（Whisperの25MB制限に対する安全マージン）
        const maxBytes = Math.min(targetBytes, 20 * 1024 * 1024);
        
        console.log(`Byte-based splitting: ${inputSizeMB.toFixed(2)}MB -> ~${(maxBytes / (1024 * 1024)).toFixed(2)}MB (${durationMinutes} min approx)`);
        
        const readStream = fs.createReadStream(inputPath, { start: 0, end: maxBytes - 1 });
        const writeStream = fs.createWriteStream(outputPath);
        
        readStream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          const outputStats = fs.statSync(outputPath);
          const outputSizeMB = outputStats.size / (1024 * 1024);
          console.log(`Audio file split by byte approximation: ${outputSizeMB.toFixed(2)}MB (first ~${durationMinutes} minutes)`);
          resolve(outputPath);
        });
        
        writeStream.on('error', (error) => {
          reject(new Error(`Byte splitting failed: ${error.message}`));
        });
        
        readStream.on('error', (error) => {
          reject(new Error(`Read error during splitting: ${error.message}`));
        });
        
      } catch (error) {
        reject(new Error(`Byte approximation setup failed: ${error.message}`));
      }
    });
  }

  /**
   * Whisper APIで音声をテキストに変換（段階的フォールバック付き）
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeAudio(audioFilePath, options = {}) {
    const client = this.initializeOpenAI();
    
    if (!client) {
      throw new Error('OpenAI API key not configured for Whisper service');
    }

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found');
    }

    const fileSizeMB = this.getFileSizeMB(audioFilePath);
    console.log(`Transcribing audio file: ${audioFilePath} (${fileSizeMB.toFixed(2)} MB)`);

    // 段階的フォールバック処理
    if (fileSizeMB > 25) {
      console.log(`File too large (${fileSizeMB.toFixed(2)} MB), attempting to process first 20 minutes only`);
      
      try {
        const splitFilePath = await this.splitAudioFile(audioFilePath, 20);
        const splitFileSizeMB = this.getFileSizeMB(splitFilePath);
        
        if (splitFileSizeMB > 25) {
          this.cleanupTempFile(splitFilePath);
          throw new Error(`Audio file too large even after splitting: ${splitFileSizeMB.toFixed(2)} MB (max 25 MB). Please use a shorter audio file.`);
        }
        
        console.log(`Processing split file: ${splitFilePath} (${splitFileSizeMB.toFixed(2)} MB)`);
        const transcription = await this.transcribeAudioFile(splitFilePath, options);
        this.cleanupTempFile(splitFilePath);
        
        // 部分転写であることを明示
        return `${transcription}\n\n[注: 音声ファイルが大きすぎるため、冒頭20分間のみを転写しました]`;
        
      } catch (splitError) {
        console.error('Split audio transcription failed:', splitError.message);
        
        // エラーの内容に基づいて適切なメッセージを生成
        if (splitError.message.includes('Audio file too large even after splitting')) {
          // 分割後もファイルサイズが大きすぎる場合
          throw splitError;
        } else if (splitError.message.includes('Failed to split') || splitError.message.includes('splitting failed')) {
          // 分割処理自体が失敗した場合
          throw new Error(`Audio file too large: ${fileSizeMB.toFixed(2)} MB (max 25 MB)`);
        } else {
          // 分割は成功したが、Whisper API呼び出しで失敗した場合
          throw new Error(`音声ファイルを約20MBに分割しましたが、音声認識処理中にエラーが発生しました: ${splitError.message}`);
        }
      }
    }

    return await this.transcribeAudioFile(audioFilePath, options);
  }

  /**
   * 実際のWhisper API呼び出し（段階的フォールバック付き）
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeAudioFile(audioFilePath, options = {}) {
    const fileSizeMB = this.getFileSizeMB(audioFilePath);
    console.log(`🎯 Starting transcription with fallback strategy: ${audioFilePath} (${fileSizeMB.toFixed(2)} MB)`);
    
    // 段階的フォールバック戦略
    const strategies = [
      { name: 'OpenAI SDK', method: 'sdk' },
      { name: 'Direct HTTP', method: 'direct' },
      { name: 'Small Chunk', method: 'chunk' }
    ];
    
    let lastError = null;
    
    for (const strategy of strategies) {
      try {
        console.log(`\n🔄 Trying strategy: ${strategy.name}`);
        
        switch (strategy.method) {
          case 'sdk':
            return await this.transcribeWithSDK(audioFilePath, options);
          case 'direct':
            return await this.transcribeAudioFileDirect(audioFilePath, options);
          case 'chunk':
            return await this.transcribeWithSmallChunks(audioFilePath, options);
        }
        
      } catch (error) {
        console.error(`❌ Strategy "${strategy.name}" failed:`, error.message);
        lastError = error;
        
        // 次の戦略に進む前の待機時間
        if (strategy !== strategies[strategies.length - 1]) {
          console.log('⏳ Waiting 2 seconds before trying next strategy...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // すべての戦略が失敗した場合
    console.error('💥 All transcription strategies failed');
    throw lastError || new Error('All transcription strategies failed');
  }

  /**
   * 小チャンク分割による転写（最後のフォールバック手法）
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeWithSmallChunks(audioFilePath, options = {}) {
    console.log('🔧 Using small chunk splitting strategy...');
    
    const fileSizeMB = this.getFileSizeMB(audioFilePath);
    console.log(`📊 Original file size: ${fileSizeMB.toFixed(2)} MB`);
    
    if (fileSizeMB <= 20) {
      console.log('📝 File size acceptable for single processing, using direct HTTP...');
      return await this.transcribeAudioFileDirect(audioFilePath, options);
    }
    
    const tempChunkPaths = [];
    let combinedTranscription = '';
    
    try {
      // ファイルを小さなチャンクに分割
      const chunkDurationMinutes = 10; // 10分単位で分割
      const maxChunks = 5; // 最大5チャンク（約50分まで処理）
      
      console.log(`🔪 Splitting file into ${chunkDurationMinutes}-minute chunks (max ${maxChunks} chunks)...`);
      
      for (let chunkIndex = 0; chunkIndex < maxChunks; chunkIndex++) {
        const chunkStartMinutes = chunkIndex * chunkDurationMinutes;
        
        try {
          // FFmpegを使用してチャンクを作成
          const chunkPath = await this.createAudioChunk(
            audioFilePath, 
            chunkStartMinutes, 
            chunkDurationMinutes
          );
          
          if (!chunkPath) {
            console.log(`⏭️  No more audio data after ${chunkStartMinutes} minutes`);
            break;
          }
          
          const chunkSizeMB = this.getFileSizeMB(chunkPath);
          console.log(`📦 Created chunk ${chunkIndex + 1}: ${chunkPath} (${chunkSizeMB.toFixed(2)} MB)`);
          
          if (chunkSizeMB < 0.1) {
            console.log(`⏭️  Chunk too small (${chunkSizeMB.toFixed(2)} MB), stopping chunk processing`);
            this.cleanupTempFile(chunkPath);
            break;
          }
          
          tempChunkPaths.push(chunkPath);
          
          // チャンクを転写
          console.log(`🎙️  Transcribing chunk ${chunkIndex + 1}...`);
          const chunkTranscription = await this.transcribeAudioFileDirect(chunkPath, options);
          
          if (chunkTranscription && chunkTranscription.trim().length > 0) {
            if (combinedTranscription.length > 0) {
              combinedTranscription += '\n\n';
            }
            combinedTranscription += `[Part ${chunkIndex + 1}]\n${chunkTranscription.trim()}`;
            console.log(`✅ Chunk ${chunkIndex + 1} transcribed: ${chunkTranscription.trim().length} characters`);
          } else {
            console.log(`⚠️  Chunk ${chunkIndex + 1} produced empty transcription`);
          }
          
          // 各チャンク間で短い待機時間
          if (chunkIndex < maxChunks - 1) {
            console.log('⏳ Waiting 3 seconds before processing next chunk...');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
        } catch (chunkError) {
          console.error(`❌ Error processing chunk ${chunkIndex + 1}:`, chunkError.message);
          
          // 最初のチャンクで失敗した場合は即座に例外を投げる
          if (chunkIndex === 0) {
            throw new Error(`Failed to process first audio chunk: ${chunkError.message}`);
          }
          
          // 後続チャンクのエラーは警告として扱い、処理を継続
          console.log(`⚠️  Continuing with partial transcription after chunk ${chunkIndex + 1} failed`);
          break;
        }
      }
      
      if (combinedTranscription.trim().length === 0) {
        throw new Error('No transcription data obtained from any chunks');
      }
      
      const totalLength = combinedTranscription.length;
      const processedChunks = tempChunkPaths.length;
      
      console.log(`✅ Small chunk transcription completed: ${totalLength} characters from ${processedChunks} chunks`);
      
      // チャンク処理であることを明示
      const resultWithMetadata = `${combinedTranscription}\n\n[注: 音声ファイルを${processedChunks}個のチャンクに分割して処理しました]`;
      
      return resultWithMetadata;
      
    } catch (error) {
      console.error('❌ Small chunk transcription failed:', error.message);
      throw new Error(`Small chunk processing failed: ${error.message}`);
    } finally {
      // 一時チャンクファイルをクリーンアップ
      console.log('🧹 Cleaning up temporary chunk files...');
      tempChunkPaths.forEach(chunkPath => {
        this.cleanupTempFile(chunkPath);
      });
    }
  }

  /**
   * 音声ファイルから指定時間のチャンクを作成
   * @param {string} inputPath - 入力音声ファイルのパス
   * @param {number} startMinutes - 開始時間（分）
   * @param {number} durationMinutes - 継続時間（分）
   * @returns {Promise<string|null>} 作成されたチャンクのパス（データがない場合はnull）
   */
  async createAudioChunk(inputPath, startMinutes, durationMinutes) {
    const timestamp = Date.now();
    const ext = require('path').extname(inputPath);
    const chunkPath = require('path').join(this.tempDir, `chunk_${startMinutes}m_${timestamp}${ext}`);
    
    try {
      const hasFFmpeg = await this.checkFFmpegAvailability();
      
      if (hasFFmpeg) {
        return await this.createChunkWithFFmpeg(inputPath, chunkPath, startMinutes, durationMinutes);
      } else {
        return await this.createChunkWithByteApproximation(inputPath, chunkPath, startMinutes, durationMinutes);
      }
    } catch (error) {
      console.error(`Failed to create audio chunk at ${startMinutes}m:`, error.message);
      throw new Error(`Audio chunk creation failed: ${error.message}`);
    }
  }

  /**
   * FFmpegを使用した精密なチャンク作成
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {number} startMinutes - 開始時間（分）
   * @param {number} durationMinutes - 継続時間（分）
   * @returns {Promise<string|null>} 作成されたファイルのパス
   */
  async createChunkWithFFmpeg(inputPath, outputPath, startMinutes, durationMinutes) {
    const { exec } = require('child_process');
    const startSeconds = startMinutes * 60;
    const durationSeconds = durationMinutes * 60;
    
    return new Promise((resolve, reject) => {
      // FFmpegコマンド: 指定時間から指定継続時間を抽出
      const command = `ffmpeg -i "${inputPath}" -ss ${startSeconds} -t ${durationSeconds} -c copy "${outputPath}" -y`;
      
      console.log(`🔧 FFmpeg command: ${command}`);
      
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('FFmpeg chunk creation error:', error.message);
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg chunk creation failed: ${error.message}`));
          return;
        }
        
        // 出力ファイルが作成されたかチェック
        if (!require('fs').existsSync(outputPath)) {
          console.log(`No output file created for chunk at ${startMinutes}m - likely end of audio`);
          resolve(null);
          return;
        }
        
        const outputSizeMB = this.getFileSizeMB(outputPath);
        if (outputSizeMB < 0.01) {
          console.log(`Chunk at ${startMinutes}m is too small (${outputSizeMB.toFixed(3)} MB) - likely end of audio`);
          this.cleanupTempFile(outputPath);
          resolve(null);
          return;
        }
        
        console.log(`✅ FFmpeg chunk created: ${outputPath} (${outputSizeMB.toFixed(2)} MB)`);
        resolve(outputPath);
      });
    });
  }

  /**
   * バイト近似による簡易チャンク作成（FFmpeg未使用時）
   * @param {string} inputPath - 入力ファイルパス
   * @param {string} outputPath - 出力ファイルパス
   * @param {number} startMinutes - 開始時間（分）
   * @param {number} durationMinutes - 継続時間（分）
   * @returns {Promise<string|null>} 作成されたファイルのパス
   */
  async createChunkWithByteApproximation(inputPath, outputPath, startMinutes, durationMinutes) {
    return new Promise((resolve, reject) => {
      try {
        const fs = require('fs');
        const inputStats = fs.statSync(inputPath);
        const inputSizeMB = inputStats.size / (1024 * 1024);
        
        // 音声ファイルの推定総継続時間（1.5分/MBの概算）
        const estimatedTotalMinutes = Math.max(30, inputSizeMB * 1.5);
        
        // チャンクの開始位置と継続時間をバイト位置に変換
        const startRatio = startMinutes / estimatedTotalMinutes;
        const durationRatio = durationMinutes / estimatedTotalMinutes;
        
        const startByte = Math.floor(inputStats.size * startRatio);
        const chunkSize = Math.floor(inputStats.size * durationRatio);
        const endByte = Math.min(startByte + chunkSize, inputStats.size);
        
        // 音声データの終端を超えている場合
        if (startByte >= inputStats.size) {
          console.log(`Byte approximation: Start position ${startByte} exceeds file size ${inputStats.size}`);
          resolve(null);
          return;
        }
        
        // 有効なチャンクサイズでない場合
        if (endByte - startByte < 1024 * 100) { // 100KB未満
          console.log(`Byte approximation: Chunk too small (${endByte - startByte} bytes)`);
          resolve(null);
          return;
        }
        
        console.log(`📊 Byte approximation: ${startMinutes}m-${startMinutes + durationMinutes}m = bytes ${startByte}-${endByte} (${((endByte - startByte) / (1024 * 1024)).toFixed(2)} MB)`);
        
        const readStream = fs.createReadStream(inputPath, { start: startByte, end: endByte - 1 });
        const writeStream = fs.createWriteStream(outputPath);
        
        readStream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          const outputStats = fs.statSync(outputPath);
          const outputSizeMB = outputStats.size / (1024 * 1024);
          console.log(`✅ Byte approximation chunk created: ${outputPath} (${outputSizeMB.toFixed(2)} MB)`);
          resolve(outputPath);
        });
        
        writeStream.on('error', (error) => {
          reject(new Error(`Byte approximation write failed: ${error.message}`));
        });
        
        readStream.on('error', (error) => {
          reject(new Error(`Byte approximation read failed: ${error.message}`));
        });
        
      } catch (error) {
        reject(new Error(`Byte approximation setup failed: ${error.message}`));
      }
    });
  }

  /**
   * OpenAI SDK経由での転写（元の実装）
   * @param {string} audioFilePath - 音声ファイルのパス
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeWithSDK(audioFilePath, options = {}) {
    console.log('📦 Using OpenAI SDK approach...');
    
    const client = this.initializeOpenAI();
    const fileSizeMB = this.getFileSizeMB(audioFilePath);
    
    // ファイルサイズに応じたリトライ回数と待機時間を設定
    const maxRetries = fileSizeMB > 10 ? 2 : 1;
    const baseWaitTime = fileSizeMB > 10 ? 5000 : 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = baseWaitTime * Math.pow(2, attempt - 1); // 指数バックオフ
          console.log(`Retrying Whisper API call (attempt ${attempt + 1}/${maxRetries + 1}) after ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const transcription = await client.audio.transcriptions.create({
          file: fs.createReadStream(audioFilePath),
          model: options.model || 'whisper-1',
          language: options.language || 'ja', // 日本語を優先
          response_format: 'text',
          temperature: options.temperature || 0.1
        });

        // API利用量を記録
        const apiUsageTracker = require('./api-usage-tracker');
        await apiUsageTracker.trackOpenAIUsage('whisper-1', {
          usage: { total_tokens: Math.ceil(fileSizeMB * 100) }, // ファイルサイズベースで概算トークン
          audioDuration: options.estimatedDuration || 60
        });

        return transcription;
      } catch (error) {
        console.error(`Whisper transcription error (attempt ${attempt + 1}):`, error.message);
        console.error('Audio file:', audioFilePath, `(${fileSizeMB.toFixed(2)} MB)`);
        
        // 詳細なエラー情報をログ出力
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
          status: error.status,
          statusText: error.statusText,
          response: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers
          } : null
        });
        
        // 最後の試行でなく、接続エラーの場合は再試行
        const isConnectionError = error.message.toLowerCase().includes('connection') || 
                                  error.message.toLowerCase().includes('network') ||
                                  error.message.toLowerCase().includes('timeout') ||
                                  error.code === 'ECONNRESET' ||
                                  error.code === 'ENOTFOUND' ||
                                  error.code === 'ETIMEDOUT';
        
        if (attempt < maxRetries && isConnectionError) {
          console.log('Connection error detected, will retry...');
          continue; // 再試行
        }
        
        // 最後の試行または非接続エラーの場合は詳細診断を実行
        if (isConnectionError) {
          console.log('Running Whisper API connection diagnosis...');
          try {
            const diagnosis = await this.diagnoseWhisperAPIConnection();
            console.log('Whisper API diagnosis result:', diagnosis);
            
            let detailedError = `Connection error: ${error.message}`;
            if (error.code) {
              detailedError += ` (Code: ${error.code})`;
            }
            
            // 詳細な診断結果に基づいたエラーメッセージ
            if (!diagnosis.hasApiKey) {
              detailedError += ' - OpenAI API key not configured';
            } else if (!diagnosis.apiKeyValid) {
              detailedError += ' - Invalid OpenAI API key';
            } else if (!diagnosis.networkReachable) {
              detailedError += ' - Network connectivity issue to OpenAI';
            } else if (!diagnosis.whisperEndpointReachable) {
              detailedError += ' - Whisper API endpoint unreachable';
            } else if (!diagnosis.canUploadFiles) {
              detailedError += ' - File upload to Whisper API failed';
            } else {
              detailedError += ' - Whisper API temporarily unavailable';
            }
            
            // 診断の詳細情報も含める
            if (diagnosis.details.whisperError) {
              detailedError += ` (Whisper Error: ${diagnosis.details.whisperError.message})`;
            }
            
            throw new Error(detailedError);
          } catch (diagError) {
            console.error('Whisper API diagnosis failed:', diagError.message);
            throw new Error(`Connection error: ${error.message}. Whisper API diagnosis also failed: ${diagError.message}`);
          }
        }
        
        // API固有のエラーハンドリング
        if (error.response) {
          const apiError = error.response.data;
          console.error('OpenAI API response error details:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: apiError
          });
          
          if (apiError && apiError.error) {
            let errorMessage = `Whisper API error: ${apiError.error.message}`;
            if (apiError.error.code) {
              errorMessage += ` (Code: ${apiError.error.code})`;
            }
            if (apiError.error.type) {
              errorMessage += ` (Type: ${apiError.error.type})`;
            }
            throw new Error(errorMessage);
          }
        }
        
        // その他のエラーの詳細情報を含める
        let finalErrorMessage = `Failed to transcribe audio: ${error.message}`;
        if (error.code) {
          finalErrorMessage += ` (Error Code: ${error.code})`;
        }
        if (error.name && error.name !== 'Error') {
          finalErrorMessage += ` (Error Type: ${error.name})`;
        }
        
        throw new Error(finalErrorMessage);
      }
    }
    // 注意: cleanupTempFileは呼び出し元で実行
  }

  /**
   * URLから音声をダウンロードして転写
   * @param {string} audioUrl - 音声ファイルのURL
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribeFromUrl(audioUrl, options = {}) {
    console.log(`Starting audio transcription from URL: ${audioUrl}`);
    
    // ファイル名を生成
    const timestamp = Date.now();
    const urlParts = new URL(audioUrl);
    const originalExt = path.extname(urlParts.pathname) || '.mp3';
    const filename = `audio_${timestamp}${originalExt}`;
    
    let filePath = null;
    
    try {
      // 音声ファイルをダウンロード
      filePath = await this.downloadAudioFile(audioUrl, filename);
      
      // Whisper APIで転写
      const transcription = await this.transcribeAudio(filePath, options);
      
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('Empty transcription result');
      }
      
      console.log(`Transcription completed: ${transcription.length} characters`);
      return transcription;
      
    } catch (error) {
      console.error('Transcription from URL failed:', error.message);
      throw error;
    } finally {
      // 一時ファイルをクリーンアップ
      if (filePath) {
        this.cleanupTempFile(filePath);
      }
    }
  }

  /**
   * 一時ファイルを削除
   * @param {string} filePath - 削除するファイルのパス
   */
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Failed to cleanup temp file ${filePath}:`, error.message);
    }
  }

  /**
   * 古い一時ファイルを削除（定期メンテナンス用）
   * @param {number} maxAgeHours - 削除する時間（デフォルト1時間）
   */
  cleanupOldTempFiles(maxAgeHours = 1) {
    try {
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      let cleanedCount = 0;

      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > maxAgeHours) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old temp files`);
      }
    } catch (error) {
      console.error('Temp file cleanup error:', error.message);
    }
  }

  /**
   * サポートされている音声形式かチェック
   * @param {string} url - 音声ファイルのURL
   * @returns {boolean} サポートされているかどうか
   */
  isSupportedAudioFormat(url) {
    const supportedFormats = [
      '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'
    ];
    
    try {
      const urlObj = new URL(url);
      const ext = path.extname(urlObj.pathname).toLowerCase();
      return supportedFormats.includes(ext);
    } catch (error) {
      return false;
    }
  }

  /**
   * エラーメッセージを日本語のユーザーフレンドリーなメッセージに変換
   * @param {Error} error - エラーオブジェクト
   * @returns {string} ユーザーフレンドリーなエラーメッセージ
   */
  getErrorMessage(error) {
    const message = error.message.toLowerCase();
    
    // ファイルサイズ関連エラー
    if (message.includes('file too large') || message.includes('25 mb')) {
      return '音声ファイルが大きすぎます（最大25MB）。短い音声ファイルか、別の音声形式をお試しください。';
    }
    
    // ダウンロード関連エラー
    if (message.includes('download') || message.includes('failed to download')) {
      return '音声ファイルのダウンロードに失敗しました。URLが正しいか、音声ファイルがアクセス可能かご確認ください。';
    }
    
    // ネットワーク関連エラー
    if (message.includes('network') || message.includes('connection') || 
        message.includes('econnreset') || message.includes('etimedout') ||
        message.includes('enotfound')) {
      return 'ネットワーク接続に問題があります。インターネット接続を確認し、しばらくしてから再試行してください。';
    }
    
    // API設定関連エラー
    if (message.includes('api key') || message.includes('not configured')) {
      return 'OpenAI APIキーが設定されていません。環境設定を確認してください。';
    }
    
    if (message.includes('invalid') && message.includes('key')) {
      return 'OpenAI APIキーが無効です。正しいAPIキー（sk-で始まる）が設定されているか確認してください。';
    }
    
    // API制限関連エラー
    if (message.includes('quota') || message.includes('exceeded') || message.includes('rate limit')) {
      return 'OpenAI APIの利用制限に達しました。しばらく時間をおいてから再試行するか、API使用量を確認してください。';
    }
    
    // タイムアウト関連エラー
    if (message.includes('timeout')) {
      return '音声処理がタイムアウトしました。ファイルサイズが大きすぎる可能性があります。短い音声ファイルをお試しください。';
    }
    
    // Whisper API特有のエラー
    if (message.includes('whisper api')) {
      return 'Whisper音声認識サービスでエラーが発生しました。音声ファイルの形式（MP3、WAV等）を確認し、再試行してください。';
    }
    
    // ファイル形式関連エラー
    if (message.includes('file format') || message.includes('invalid file') || 
        message.includes('unsupported')) {
      return '音声ファイルの形式がサポートされていません。MP3、WAV、M4A等の一般的な音声形式をお使いください。';
    }
    
    // 音声変換関連エラー
    if (message.includes('transcription') || message.includes('transcribe')) {
      return '音声の文字起こしに失敗しました。音声が明瞭でない可能性があります。別の音声ファイルをお試しください。';
    }
    
    // 分割処理関連エラー
    if (message.includes('split') || message.includes('splitting')) {
      return '音声ファイルの分割処理に失敗しました。ファイルが破損している可能性があります。';
    }
    
    // 診断関連エラー
    if (message.includes('diagnosis')) {
      return 'Whisper API接続診断に失敗しました。ネットワーク設定またはAPI設定を確認してください。';
    }
    
    // その他のエラー
    return `音声認識中にエラーが発生しました。音声ファイルの形式やサイズを確認し、再試行してください。（詳細: ${error.message.substring(0, 100)}）`;
  }
}

module.exports = new WhisperService();