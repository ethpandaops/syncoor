package sysinfo

import (
	"context"
	"os"
	"runtime"

	"github.com/sirupsen/logrus"
)

type Service interface {
	GetSystemInfo(ctx context.Context) (*SystemInfo, error)
}

type SystemInfo struct {
	Hostname        string `json:"hostname"`
	OS              string `json:"os"`
	Architecture    string `json:"architecture"`
	CPUCount        int    `json:"cpu_count"`
	CPUModel        string `json:"cpu_model,omitempty"`
	TotalMemory     uint64 `json:"total_memory"`
	GoVersion       string `json:"go_version"`
	KernelVersion   string `json:"kernel_version,omitempty"`
	Platform        string `json:"platform"`
	PlatformFamily  string `json:"platform_family,omitempty"`
	PlatformVersion string `json:"platform_version,omitempty"`
}

type service struct {
	log logrus.FieldLogger
}

func NewService(log logrus.FieldLogger) Service {
	return &service{
		log: log.WithField("package", "sysinfo"),
	}
}

func (s *service) GetSystemInfo(ctx context.Context) (*SystemInfo, error) {
	s.log.Debug("Collecting system information")

	info := &SystemInfo{
		OS:           runtime.GOOS,
		Architecture: runtime.GOARCH,
		CPUCount:     runtime.NumCPU(),
		GoVersion:    runtime.Version(),
		Platform:     runtime.GOOS,
	}

	hostname, err := os.Hostname()
	if err != nil {
		s.log.WithError(err).Warn("Failed to get hostname")
		info.Hostname = "unknown"
	} else {
		info.Hostname = hostname
	}

	s.collectPlatformSpecificInfo(info)

	s.log.WithField("system_info", info).Debug("System information collected")
	return info, nil
}

func (s *service) collectPlatformSpecificInfo(info *SystemInfo) {
	osInfo := getOSInfo()

	info.TotalMemory = osInfo.totalMemory
	info.KernelVersion = osInfo.kernelVersion
	info.PlatformFamily = osInfo.platformFamily
	info.PlatformVersion = osInfo.platformVersion
	info.CPUModel = osInfo.cpuModel
}

var _ Service = (*service)(nil)
