#!/usr/bin/env node

/**
 * ネットワーク診断とWhisper API接続テスト用スタンドアロンスクリプト
 * WSL2環境でのConnection errorトラブルシューティング用
 * 
 * 使用方法:
 * node debug-network.js
 * 
 * または実行可能にして:
 * chmod +x debug-network.js
 * ./debug-network.js
 */

const fs = require('fs');
const path = require('path');

// 環境変数をロード (.envファイルが存在する場合)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
  console.log('✓ .env file loaded');
}

// WhisperServiceを読み込み
const whisperService = require('./backend/utils/whisper-service');

async function runNetworkDiagnosis() {
  console.log('🔍 Starting comprehensive network diagnosis...\n');
  
  try {
    // 0. API Key validation first
    console.log('0️⃣ Validating API Key...');
    const apiKeyValidation = await whisperService.validateAPIKeyDetailed();
    
    if (!apiKeyValidation.hasApiKey) {
      console.log('🚨 CRITICAL: No API key found!');
      console.log(`   Error: ${apiKeyValidation.error}`);
      return;
    }
    
    // 1. 詳細なレイヤード診断を実行
    console.log('\n1️⃣ Running layered network diagnosis...');
    const layeredDiagnosis = await whisperService.diagnoseNetworkLayered();
    
    console.log('📊 Network Diagnosis Results:');
    console.log('==========================================');
    
    // 環境情報
    console.log(`🖥️  Environment: ${layeredDiagnosis.environment.platform} (WSL: ${layeredDiagnosis.environment.isWSL})`);
    console.log(`📅 Timestamp: ${layeredDiagnosis.environment.timestamp}`);
    
    // 各レイヤーの結果
    const layers = ['dns', 'tcp', 'https', 'openaiApi', 'whisperApi'];
    layers.forEach(layer => {
      const result = layeredDiagnosis[layer];
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${layer.toUpperCase()}: ${result.success ? 'OK' : 'FAILED'}`);
      
      if (result.details && Object.keys(result.details).length > 0) {
        if (result.success) {
          if (layer === 'dns') {
            console.log(`   Addresses: ${result.details.addresses?.join(', ')}`);
            console.log(`   Resolve time: ${result.details.resolveTimeMs}ms`);
          } else if (layer === 'tcp') {
            console.log(`   Connect time: ${result.details.connectTimeMs}ms`);
            console.log(`   Local: ${result.details.localAddress}:${result.details.localPort}`);
          } else if (layer === 'https') {
            console.log(`   Status: ${result.details.statusCode} ${result.details.statusMessage}`);
            console.log(`   Response time: ${result.details.responseTimeMs}ms`);
            console.log(`   TLS: ${result.details.tlsVersion}`);
          }
        } else {
          console.log(`   Error: ${result.details.error || 'Unknown error'}`);
          if (result.details.code) {
            console.log(`   Code: ${result.details.code}`);
          }
        }
      }
    });
    
    // プロキシ情報
    console.log('\n🌐 Proxy Configuration:');
    console.log('==========================================');
    if (layeredDiagnosis.proxy.detected) {
      console.log('⚠️  Proxy detected:');
      Object.entries(layeredDiagnosis.proxy.details).forEach(([key, value]) => {
        if (value) console.log(`   ${key}: ${value}`);
      });
      if (layeredDiagnosis.proxy.working !== undefined) {
        console.log(`   Working: ${layeredDiagnosis.proxy.working ? '✅' : '❌'}`);
      }
    } else {
      console.log('✅ No proxy configured');
    }
    
    // WSL2特有の情報
    if (layeredDiagnosis.environment.isWSL && layeredDiagnosis.proxy.wsl2Specific) {
      console.log('\n🐧 WSL2 Specific Information:');
      console.log('==========================================');
      const wsl2 = layeredDiagnosis.proxy.wsl2Specific;
      
      if (wsl2.networking?.wslIP) {
        console.log(`WSL IP: ${wsl2.networking.wslIP}`);
      }
      
      if (wsl2.dns?.nameservers) {
        console.log(`DNS Servers: ${wsl2.dns.nameservers.join(', ')}`);
      }
      
      if (wsl2.mtu?.value) {
        const mtuStatus = wsl2.mtu.optimal ? '✅' : '⚠️';
        console.log(`${mtuStatus} MTU: ${wsl2.mtu.value} (optimal: >= 1500)`);
      }
      
      if (wsl2.ipv6?.disabled !== undefined) {
        console.log(`IPv6 disabled: ${wsl2.ipv6.disabled}`);
      }
    }

    // 基本ネットワークテスト結果
    if (layeredDiagnosis.basicNetworkTests) {
      console.log('\n🌐 Basic Network Tests:');
      console.log('==========================================');
      const tests = layeredDiagnosis.basicNetworkTests;
      
      console.log(`📡 Ping: ${tests.ping.success ? '✅ OK' : '❌ FAILED'}`);
      if (tests.ping.success && tests.ping.details.avgRtt) {
        console.log(`   Average RTT: ${tests.ping.details.avgRtt.toFixed(1)}ms`);
      }
      if (!tests.ping.success && tests.ping.details.error) {
        console.log(`   Error: ${tests.ping.details.error}`);
      }
      
      console.log(`🔍 DNS Lookup: ${tests.nslookup.success ? '✅ OK' : '❌ FAILED'}`);
      if (tests.nslookup.success && tests.nslookup.details.addresses) {
        console.log(`   Resolved IPs: ${tests.nslookup.details.addresses.join(', ')}`);
      }
      if (!tests.nslookup.success && tests.nslookup.details.error) {
        console.log(`   Error: ${tests.nslookup.details.error}`);
      }
      
      console.log(`🌐 HTTPS (curl): ${tests.curl.success ? '✅ OK' : '❌ FAILED'}`);
      if (tests.curl.success) {
        console.log(`   HTTP Code: ${tests.curl.details.httpCode}`);
        console.log(`   Response Time: ${tests.curl.details.responseTime}s`);
      }
      if (!tests.curl.success && tests.curl.details.error) {
        console.log(`   Error: ${tests.curl.details.error}`);
      }
      
      // 環境変数情報
      if (tests.environment) {
        console.log('\n🔧 Environment Variables:');
        Object.entries(tests.environment).forEach(([key, value]) => {
          if (value !== 'not_set') {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
    }
    
    // 推奨事項
    console.log('\n💡 Recommendations:');
    console.log('==========================================');
    const allRecommendations = layeredDiagnosis.recommendations.concat(
      layeredDiagnosis.proxy.recommendations || []
    );
    
    if (allRecommendations.length > 0) {
      allRecommendations.forEach((rec, index) => {
        const priority = rec.priority === 'critical' ? '🚨' : 
                        rec.priority === 'high' ? '⚠️' : 
                        rec.priority === 'medium' ? '📝' : 'ℹ️';
        console.log(`${priority} ${rec.issue}`);
        console.log(`   Solution: ${rec.solution}`);
        if (rec.wsl2Specific) console.log('   (WSL2 specific)');
        console.log('');
      });
    } else {
      console.log('✅ No specific issues detected');
    }
    
    return layeredDiagnosis;
    
  } catch (error) {
    console.error('❌ Network diagnosis failed:', error.message);
    throw error;
  }
}

async function runChunkTest() {
  console.log('\n2️⃣ Running small chunk upload test...');
  
  try {
    const canUpload = await whisperService.testSmallChunkUpload();
    
    if (canUpload) {
      console.log('✅ Small chunk upload test: PASSED');
      console.log('   Large file uploads should work');
    } else {
      console.log('❌ Small chunk upload test: FAILED');
      console.log('   Large file uploads likely to fail');
    }
    
    return canUpload;
  } catch (error) {
    console.error('❌ Chunk test failed:', error.message);
    return false;
  }
}

async function generateReport(diagnosis, chunkTestResult) {
  console.log('\n📋 SUMMARY REPORT');
  console.log('==========================================');
  
  const criticalIssues = diagnosis.recommendations.filter(r => r.priority === 'critical').length;
  const highIssues = diagnosis.recommendations.filter(r => r.priority === 'high').length;
  
  // 全体的な状態評価
  let overallStatus = 'HEALTHY';
  if (criticalIssues > 0) {
    overallStatus = 'CRITICAL';
  } else if (highIssues > 0 || !diagnosis.whisperApi.success) {
    overallStatus = 'WARNING';
  } else if (!chunkTestResult) {
    overallStatus = 'WARNING';
  }
  
  const statusIcon = overallStatus === 'HEALTHY' ? '✅' : 
                    overallStatus === 'WARNING' ? '⚠️' : '🚨';
  
  console.log(`${statusIcon} Overall Status: ${overallStatus}`);
  console.log(`🔍 Environment: ${diagnosis.environment.platform}${diagnosis.environment.isWSL ? ' (WSL2)' : ''}`);
  console.log(`📊 Tests Passed: ${Object.values(diagnosis).filter(d => d.success).length}/5`);
  console.log(`⚠️  Critical Issues: ${criticalIssues}`);
  console.log(`📝 High Priority Issues: ${highIssues}`);
  console.log(`🗂️  Large File Upload: ${chunkTestResult ? 'LIKELY OK' : 'LIKELY FAIL'}`);
  
  console.log('\n🎯 Next Steps:');
  if (overallStatus === 'CRITICAL') {
    console.log('1. Address critical network connectivity issues first');
    console.log('2. Run this diagnosis again after fixes');
  } else if (overallStatus === 'WARNING') {
    console.log('1. Review warning-level recommendations');
    console.log('2. Test with actual audio files');
  } else {
    console.log('1. Network appears healthy - try your audio processing');
    console.log('2. If still experiencing issues, they may be transient');
  }
  
  // ファイル保存の提案
  console.log('\n💾 To save this report:');
  console.log('   node debug-network.js > network-diagnosis-report.txt');
}

// メイン実行関数
async function main() {
  console.log('🚀 Network Diagnosis Tool for Whisper API');
  console.log('=========================================\n');
  
  try {
    // API キーチェック
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  OPENAI_API_KEY not found in environment variables');
      console.log('   Set it in .env file or export OPENAI_API_KEY=your-key\n');
    } else {
      console.log('✅ OPENAI_API_KEY found');
    }
    
    // ネットワーク診断実行
    const diagnosis = await runNetworkDiagnosis();
    
    // チャンクテスト実行
    const chunkTestResult = await runChunkTest();
    
    // レポート生成
    await generateReport(diagnosis, chunkTestResult);
    
    console.log('\n✨ Diagnosis completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Diagnosis failed with error:', error.message);
    process.exit(1);
  }
}

// スクリプトとして実行された場合のみmain()を呼び出し
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runNetworkDiagnosis, runChunkTest, generateReport };