#!/usr/bin/env node

/**
 * WSL2設定チェッカー - WSL2環境の最適化状況をチェック
 * 
 * 使用方法:
 * node wsl2-check.js
 * 
 * または実行可能にして:
 * chmod +x wsl2-check.js
 * ./wsl2-check.js
 */

const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class WSL2Checker {
  constructor() {
    this.results = {
      environment: {},
      network: {},
      dns: {},
      firewall: {},
      performance: {},
      recommendations: []
    };
  }

  async checkEnvironment() {
    console.log('🔍 Checking WSL2 environment...');
    
    try {
      // WSL バージョン確認
      if (fs.existsSync('/proc/version')) {
        const version = fs.readFileSync('/proc/version', 'utf8');
        this.results.environment.isWSL = version.includes('Microsoft') || version.includes('WSL');
        this.results.environment.versionString = version.trim();
        
        if (this.results.environment.isWSL) {
          console.log('✅ Running in WSL2 environment');
        } else {
          console.log('ℹ️  Not running in WSL2');
          return false;
        }
      }

      // カーネルバージョン
      const { stdout: unameOutput } = await execAsync('uname -r');
      this.results.environment.kernelVersion = unameOutput.trim();
      console.log(`📋 Kernel: ${this.results.environment.kernelVersion}`);

      // WSL2設定ファイル確認
      const wslConfPath = '/etc/wsl.conf';
      if (fs.existsSync(wslConfPath)) {
        this.results.environment.wslConfExists = true;
        this.results.environment.wslConf = fs.readFileSync(wslConfPath, 'utf8');
        console.log('✅ /etc/wsl.conf exists');
      } else {
        this.results.environment.wslConfExists = false;
        console.log('⚠️  /etc/wsl.conf not found');
      }

      return true;
    } catch (error) {
      console.error('❌ Environment check failed:', error.message);
      return false;
    }
  }

  async checkNetwork() {
    console.log('\n🌐 Checking network configuration...');
    
    try {
      // ネットワークインターフェース
      const { stdout: ipOutput } = await execAsync('ip addr show eth0');
      this.results.network.interface = ipOutput;
      
      const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        this.results.network.ipAddress = ipMatch[1];
        console.log(`📡 WSL IP: ${this.results.network.ipAddress}`);
      }

      // MTU確認
      const mtuMatch = ipOutput.match(/mtu (\d+)/);
      if (mtuMatch) {
        this.results.network.mtu = parseInt(mtuMatch[1]);
        const mtuStatus = this.results.network.mtu >= 1500 ? '✅' : '⚠️';
        console.log(`${mtuStatus} MTU: ${this.results.network.mtu}`);
        
        if (this.results.network.mtu < 1500) {
          this.results.recommendations.push({
            issue: 'Low MTU may cause large file transfer issues',
            solution: `Current MTU: ${this.results.network.mtu}. Consider increasing: sudo ip link set dev eth0 mtu 1500`,
            priority: 'medium'
          });
        }
      }

      // ルーティングテーブル
      const { stdout: routeOutput } = await execAsync('ip route show');
      this.results.network.routes = routeOutput;
      
      const defaultGateway = routeOutput.match(/default via (\d+\.\d+\.\d+\.\d+)/);
      if (defaultGateway) {
        this.results.network.defaultGateway = defaultGateway[1];
        console.log(`🚪 Default Gateway: ${this.results.network.defaultGateway}`);
      }

    } catch (error) {
      console.error('❌ Network check failed:', error.message);
    }
  }

  async checkDNS() {
    console.log('\n🔍 Checking DNS configuration...');
    
    try {
      // resolv.conf確認
      if (fs.existsSync('/etc/resolv.conf')) {
        const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        this.results.dns.resolvConf = resolvConf;
        
        const nameservers = resolvConf.match(/nameserver\s+(\S+)/g);
        if (nameservers) {
          this.results.dns.nameservers = nameservers.map(ns => ns.split(/\s+/)[1]);
          console.log(`📇 DNS Servers: ${this.results.dns.nameservers.join(', ')}`);
          
          // Windows DNS forwarding検出
          const hasWindowsDNS = this.results.dns.nameservers.some(ns => ns.startsWith('172.'));
          if (hasWindowsDNS) {
            console.log('⚠️  Using Windows DNS forwarding (172.x.x.x)');
            this.results.recommendations.push({
              issue: 'Windows DNS forwarding may be slow',
              solution: 'Consider using public DNS: echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf',
              priority: 'low'
            });
          } else {
            console.log('✅ Using direct DNS servers');
          }
        }
      }

      // DNS解決テスト
      const { stdout: nslookupOutput } = await execAsync('nslookup api.openai.com');
      this.results.dns.nslookupTest = nslookupOutput;
      
      if (nslookupOutput.includes('Address:')) {
        console.log('✅ DNS resolution working');
      } else {
        console.log('❌ DNS resolution may have issues');
        this.results.recommendations.push({
          issue: 'DNS resolution issues detected',
          solution: 'Check /etc/resolv.conf and try using 8.8.8.8 or 1.1.1.1',
          priority: 'high'
        });
      }

    } catch (error) {
      console.error('❌ DNS check failed:', error.message);
    }
  }

  async checkFirewall() {
    console.log('\n🛡️  Checking firewall and Windows integration...');
    
    try {
      // Windows Firewall状態をチェック（限定的）
      try {
        const { stdout: firewallOutput } = await execAsync(
          'powershell.exe -Command "Get-NetFirewallProfile | Select-Object -Property Name,Enabled" 2>/dev/null',
          { timeout: 5000 }
        );
        
        if (firewallOutput) {
          this.results.firewall.windowsFirewall = firewallOutput.trim();
          console.log('📊 Windows Firewall Status:');
          console.log(firewallOutput.trim());
          
          if (firewallOutput.includes('True')) {
            this.results.recommendations.push({
              issue: 'Windows Firewall is enabled',
              solution: 'Consider adding exception for WSL2/Node.js in Windows Defender Firewall',
              priority: 'medium'
            });
          }
        }
      } catch (psError) {
        console.log('⚠️  Could not check Windows Firewall (PowerShell not available)');
      }

      // WSL内のfirewall確認
      try {
        const { stdout: ufwStatus } = await execAsync('sudo ufw status 2>/dev/null');
        this.results.firewall.ufwStatus = ufwStatus;
        
        if (ufwStatus.includes('Status: active')) {
          console.log('⚠️  UFW firewall is active in WSL');
          this.results.recommendations.push({
            issue: 'UFW firewall active in WSL',
            solution: 'Consider disabling or configuring UFW: sudo ufw disable',
            priority: 'medium'
          });
        } else {
          console.log('✅ No active WSL firewall detected');
        }
      } catch (ufwError) {
        console.log('ℹ️  UFW not installed or not accessible');
      }

    } catch (error) {
      console.error('❌ Firewall check failed:', error.message);
    }
  }

  async checkPerformance() {
    console.log('\n⚡ Checking performance settings...');
    
    try {
      // メモリ使用量
      const { stdout: memInfo } = await execAsync('cat /proc/meminfo | grep -E "MemTotal|MemAvailable"');
      this.results.performance.memory = memInfo.trim();
      
      const memTotal = memInfo.match(/MemTotal:\s+(\d+)/);
      const memAvailable = memInfo.match(/MemAvailable:\s+(\d+)/);
      
      if (memTotal && memAvailable) {
        const totalMB = Math.round(parseInt(memTotal[1]) / 1024);
        const availableMB = Math.round(parseInt(memAvailable[1]) / 1024);
        console.log(`💾 Memory: ${availableMB}MB available / ${totalMB}MB total`);
        
        if (availableMB < 1000) {
          this.results.recommendations.push({
            issue: 'Low available memory',
            solution: 'Consider closing other applications or increasing WSL2 memory limit',
            priority: 'medium'
          });
        }
      }

      // IPv6設定
      try {
        const { stdout: ipv6Status } = await execAsync('cat /proc/sys/net/ipv6/conf/all/disable_ipv6');
        this.results.performance.ipv6Disabled = ipv6Status.trim() === '1';
        
        if (this.results.performance.ipv6Disabled) {
          console.log('✅ IPv6 disabled (good for some network issues)');
        } else {
          console.log('ℹ️  IPv6 enabled');
          this.results.recommendations.push({
            issue: 'IPv6 enabled may cause connection issues',
            solution: 'Consider disabling IPv6: echo 1 | sudo tee /proc/sys/net/ipv6/conf/all/disable_ipv6',
            priority: 'low'
          });
        }
      } catch (ipv6Error) {
        console.log('⚠️  Could not check IPv6 status');
      }

    } catch (error) {
      console.error('❌ Performance check failed:', error.message);
    }
  }

  async generateRecommendations() {
    console.log('\n💡 WSL2 Optimization Recommendations:');
    console.log('=====================================');
    
    if (this.results.recommendations.length === 0) {
      console.log('✅ No specific optimizations needed - configuration looks good!');
      return;
    }

    const highPriority = this.results.recommendations.filter(r => r.priority === 'high');
    const mediumPriority = this.results.recommendations.filter(r => r.priority === 'medium');
    const lowPriority = this.results.recommendations.filter(r => r.priority === 'low');

    if (highPriority.length > 0) {
      console.log('\n🚨 High Priority Issues:');
      highPriority.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.issue}`);
        console.log(`   Solution: ${rec.solution}\n`);
      });
    }

    if (mediumPriority.length > 0) {
      console.log('⚠️  Medium Priority Improvements:');
      mediumPriority.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.issue}`);
        console.log(`   Solution: ${rec.solution}\n`);
      });
    }

    if (lowPriority.length > 0) {
      console.log('📝 Optional Optimizations:');
      lowPriority.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.issue}`);
        console.log(`   Solution: ${rec.solution}\n`);
      });
    }
  }

  async run() {
    console.log('🐧 WSL2 Configuration Checker');
    console.log('=============================\n');

    const isWSL = await this.checkEnvironment();
    
    if (!isWSL) {
      console.log('❌ This tool is designed for WSL2 environments only.');
      return;
    }

    await this.checkNetwork();
    await this.checkDNS();
    await this.checkFirewall();
    await this.checkPerformance();
    await this.generateRecommendations();

    console.log('\n📋 Check completed! Results saved to this.results');
    console.log('💾 To save full report: node wsl2-check.js > wsl2-report.txt');
  }
}

// メイン実行
async function main() {
  const checker = new WSL2Checker();
  try {
    await checker.run();
  } catch (error) {
    console.error('💥 WSL2 check failed:', error.message);
    process.exit(1);
  }
}

// スクリプトとして実行された場合のみmain()を呼び出し
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WSL2Checker;