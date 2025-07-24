package sysinfo

import (
	"bufio"
	"context"
	"io/ioutil"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/sirupsen/logrus"
	"github.com/zcalusic/sysinfo"
)

type Service interface {
	GetSystemInfo(ctx context.Context) (*SystemInfo, error)
	SetSyncoorVersion(version string)
}

type SystemInfo struct {
	// Basic system information
	Hostname       string `json:"hostname"`
	GoVersion      string `json:"go_version"`
	SyncoorVersion string `json:"syncoor_version,omitempty"`

	// Enhanced system information from zcalusic/sysinfo
	OSName         string `json:"os_name,omitempty"`
	OSVendor       string `json:"os_vendor,omitempty"`
	OSVersion      string `json:"os_version,omitempty"`
	OSRelease      string `json:"os_release,omitempty"`
	OSArchitecture string `json:"os_architecture,omitempty"`
	KernelVersion  string `json:"kernel_version,omitempty"`
	KernelRelease  string `json:"kernel_release,omitempty"`

	// CPU information
	CPUVendor  string `json:"cpu_vendor,omitempty"`
	CPUModel   string `json:"cpu_model,omitempty"`
	CPUSpeed   uint   `json:"cpu_speed,omitempty"`   // MHz
	CPUCache   uint   `json:"cpu_cache,omitempty"`   // KB
	CPUCores   uint   `json:"cpu_cores,omitempty"`   // Physical cores
	CPUThreads uint   `json:"cpu_threads,omitempty"` // Logical cores

	// Memory information
	TotalMemory uint64 `json:"total_memory"` // Bytes for compatibility
	MemoryType  string `json:"memory_type,omitempty"`
	MemorySpeed uint   `json:"memory_speed,omitempty"` // MT/s

	// Hardware information
	Hypervisor    string `json:"hypervisor,omitempty"`
	Timezone      string `json:"timezone,omitempty"`
	ProductName   string `json:"product_name,omitempty"`
	ProductVendor string `json:"product_vendor,omitempty"`
	BoardName     string `json:"board_name,omitempty"`
	BoardVendor   string `json:"board_vendor,omitempty"`

	// Legacy fields for backward compatibility
	PlatformFamily  string `json:"platform_family,omitempty"`
	PlatformVersion string `json:"platform_version,omitempty"`
}

type service struct {
	log            logrus.FieldLogger
	syncoorVersion string
}

func NewService(log logrus.FieldLogger) Service {
	return &service{
		log: log.WithField("package", "sysinfo"),
	}
}

func (s *service) SetSyncoorVersion(version string) {
	s.syncoorVersion = version
}

func (s *service) GetSystemInfo(ctx context.Context) (*SystemInfo, error) {
	s.log.Debug("Collecting system information using zcalusic/sysinfo")

	var si sysinfo.SysInfo
	si.GetSysInfo()

	info := &SystemInfo{
		// Basic information
		Hostname:       si.Node.Hostname,
		GoVersion:      runtime.Version(),
		SyncoorVersion: s.syncoorVersion,

		// Enhanced OS information
		OSName:         si.OS.Name,
		OSVendor:       si.OS.Vendor,
		OSVersion:      si.OS.Version,
		OSRelease:      si.OS.Release,
		OSArchitecture: si.OS.Architecture,
		KernelVersion:  si.Kernel.Release,
		KernelRelease:  si.Kernel.Version,

		// CPU information
		CPUVendor:  si.CPU.Vendor,
		CPUModel:   si.CPU.Model,
		CPUSpeed:   si.CPU.Speed,
		CPUCache:   si.CPU.Cache,
		CPUCores:   si.CPU.Cores,
		CPUThreads: si.CPU.Threads,

		// Memory information (convert MB to bytes for compatibility)
		TotalMemory: uint64(si.Memory.Size) * 1024 * 1024,
		MemoryType:  si.Memory.Type,
		MemorySpeed: si.Memory.Speed,

		// Hardware information
		Hypervisor:    si.Node.Hypervisor,
		Timezone:      si.Node.Timezone,
		ProductName:   si.Product.Name,
		ProductVendor: si.Product.Vendor,
		BoardName:     si.Board.Name,
		BoardVendor:   si.Board.Vendor,

		// Legacy compatibility fields
		PlatformFamily:  si.OS.Name,
		PlatformVersion: si.OS.Version,
	}

	// Get hostname from system call or zcalusic/sysinfo
	if info.Hostname == "" {
		hostname, err := os.Hostname()
		if err != nil {
			s.log.WithError(err).Warn("Failed to get hostname")
			info.Hostname = "unknown"
		} else {
			info.Hostname = hostname
		}
	}

	// Apply platform-specific fallbacks for non-Linux systems
	s.applyPlatformFallbacks(info)

	// Set OSArchitecture fallback if not available from zcalusic/sysinfo
	if info.OSArchitecture == "" {
		info.OSArchitecture = runtime.GOARCH
	}

	s.log.WithField("system_info", info).Debug("System information collected")
	return info, nil
}

// applyPlatformFallbacks adds platform-specific information when zcalusic/sysinfo doesn't provide it
func (s *service) applyPlatformFallbacks(info *SystemInfo) {
	// For macOS (Darwin), add specific information
	if runtime.GOOS == "darwin" {
		s.applyDarwinFallbacks(info)
	}
	// For Linux, add specific information
	if runtime.GOOS == "linux" {
		s.applyLinuxFallbacks(info)
	}
}

// applyDarwinFallbacks adds macOS-specific information
func (s *service) applyDarwinFallbacks(info *SystemInfo) {
	// Get CPU model from sysctl
	if info.CPUModel == "" {
		if output, err := exec.Command("sysctl", "-n", "machdep.cpu.brand_string").Output(); err == nil {
			info.CPUModel = strings.TrimSpace(string(output))
		}
	}

	// Get memory size from sysctl
	if info.TotalMemory == 0 {
		if output, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
			if memsize, err := strconv.ParseUint(strings.TrimSpace(string(output)), 10, 64); err == nil {
				info.TotalMemory = memsize
			}
		}
	}

	// Get macOS version
	if info.OSVersion == "" || info.OSName == "" {
		if output, err := exec.Command("sw_vers", "-productVersion").Output(); err == nil {
			info.OSVersion = strings.TrimSpace(string(output))
			info.PlatformVersion = info.OSVersion
		}
		if output, err := exec.Command("sw_vers", "-productName").Output(); err == nil {
			info.OSName = strings.TrimSpace(string(output))
			info.PlatformFamily = info.OSName
		}
	}

	// Get kernel version
	if info.KernelVersion == "" {
		if output, err := exec.Command("uname", "-r").Output(); err == nil {
			info.KernelVersion = strings.TrimSpace(string(output))
		}
	}
}

// applyLinuxFallbacks adds Linux-specific information
func (s *service) applyLinuxFallbacks(info *SystemInfo) {
	// Get CPU model from /proc/cpuinfo
	if info.CPUModel == "" {
		if file, err := os.Open("/proc/cpuinfo"); err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "model name") {
					parts := strings.SplitN(line, ":", 2)
					if len(parts) == 2 {
						info.CPUModel = strings.TrimSpace(parts[1])
						break
					}
				}
			}
		}
	}

	// Get memory size from /proc/meminfo
	if info.TotalMemory == 0 {
		if file, err := os.Open("/proc/meminfo"); err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "MemTotal:") {
					fields := strings.Fields(line)
					if len(fields) >= 2 {
						if memKB, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
							info.TotalMemory = memKB * 1024 // Convert KB to bytes
							break
						}
					}
				}
			}
		}
	}

	// Get OS information from /etc/os-release
	if info.OSName == "" || info.OSVersion == "" {
		if data, err := ioutil.ReadFile("/etc/os-release"); err == nil {
			lines := strings.Split(string(data), "\n")
			for _, line := range lines {
				if strings.HasPrefix(line, "NAME=") {
					info.OSName = strings.Trim(strings.TrimPrefix(line, "NAME="), "\"")
					info.PlatformFamily = info.OSName
				} else if strings.HasPrefix(line, "VERSION=") {
					info.OSVersion = strings.Trim(strings.TrimPrefix(line, "VERSION="), "\"")
					info.PlatformVersion = info.OSVersion
				} else if strings.HasPrefix(line, "PRETTY_NAME=") && info.OSName == "" {
					// Fallback to PRETTY_NAME if NAME is not available
					info.OSName = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
					info.PlatformFamily = info.OSName
				}
			}
		}
	}

	// Fallback to lsb_release command if /etc/os-release doesn't work
	if info.OSName == "" {
		if output, err := exec.Command("lsb_release", "-d", "-s").Output(); err == nil {
			info.OSName = strings.Trim(strings.TrimSpace(string(output)), "\"")
			info.PlatformFamily = info.OSName
		}
	}
	if info.OSVersion == "" {
		if output, err := exec.Command("lsb_release", "-r", "-s").Output(); err == nil {
			info.OSVersion = strings.TrimSpace(string(output))
			info.PlatformVersion = info.OSVersion
		}
	}

	// Get kernel version
	if info.KernelVersion == "" {
		if output, err := exec.Command("uname", "-r").Output(); err == nil {
			info.KernelVersion = strings.TrimSpace(string(output))
		}
	}

	// Get kernel release (full version string)
	if info.KernelRelease == "" {
		if output, err := exec.Command("uname", "-v").Output(); err == nil {
			info.KernelRelease = strings.TrimSpace(string(output))
		}
	}
}

var _ Service = (*service)(nil)
