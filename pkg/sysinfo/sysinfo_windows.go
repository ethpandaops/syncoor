//go:build windows
// +build windows

package sysinfo

type osInfo struct {
	totalMemory     uint64
	kernelVersion   string
	platformFamily  string
	platformVersion string
	cpuModel        string
}

func getOSInfo() osInfo {
	return osInfo{
		platformFamily: "windows",
		totalMemory:    0, // Not implemented for Windows
	}
}
