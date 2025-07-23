//go:build darwin || linux || freebsd || openbsd || netbsd
// +build darwin linux freebsd openbsd netbsd

package sysinfo

import (
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

type osInfo struct {
	totalMemory     uint64
	kernelVersion   string
	platformFamily  string
	platformVersion string
	cpuModel        string
}

func getOSInfo() osInfo {
	info := osInfo{
		platformFamily: runtime.GOOS,
	}

	// Get kernel version
	if output, err := exec.Command("uname", "-r").Output(); err == nil {
		info.kernelVersion = strings.TrimSpace(string(output))
	}

	// Platform-specific memory and version detection
	switch runtime.GOOS {
	case "darwin":
		getDarwinInfo(&info)
	case "linux":
		getLinuxInfo(&info)
	default:
		// For other Unix-like systems, basic info only
	}

	return info
}

func getDarwinInfo(info *osInfo) {
	// Get memory size
	if output, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
		if memsize, err := strconv.ParseUint(strings.TrimSpace(string(output)), 10, 64); err == nil {
			info.totalMemory = memsize
		}
	}

	// Get macOS version
	if output, err := exec.Command("sw_vers", "-productVersion").Output(); err == nil {
		info.platformVersion = strings.TrimSpace(string(output))
	}

	// Get CPU model
	if output, err := exec.Command("sysctl", "-n", "machdep.cpu.brand_string").Output(); err == nil {
		info.cpuModel = strings.TrimSpace(string(output))
	}
}

func getLinuxInfo(info *osInfo) {
	// Get memory from /proc/meminfo
	if content, err := os.ReadFile("/proc/meminfo"); err == nil {
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if memKB, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
						info.totalMemory = memKB * 1024 // Convert KB to bytes
					}
				}
				break
			}
		}
	}

	// Get Linux distribution version
	if content, err := os.ReadFile("/etc/os-release"); err == nil {
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "VERSION_ID=") {
				info.platformVersion = strings.Trim(strings.TrimPrefix(line, "VERSION_ID="), "\"")
				break
			}
		}
	}

	// Get CPU model from /proc/cpuinfo
	if content, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					info.cpuModel = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}
}
