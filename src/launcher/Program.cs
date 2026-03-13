using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

public static class Program
{
    private static int Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodePath = Path.Combine(baseDir, "runtime", "node.exe");
        string configPath = Path.Combine(baseDir, "config", "local.config.json");
        string exampleConfigPath = Path.Combine(baseDir, "config", "local.config.example.json");

        if (HasFlag(args, "--help") || HasFlag(args, "-h"))
        {
            PrintHelp();
            return 0;
        }

        if (!File.Exists(nodePath))
        {
            Console.Error.WriteLine("Missing runtime: " + nodePath);
            return 1;
        }

        if (!File.Exists(configPath))
        {
            if (File.Exists(exampleConfigPath))
            {
                File.Copy(exampleConfigPath, configPath, false);
                Console.WriteLine("config/local.config.json was created from the example template.");
            }

            Console.WriteLine("Please edit config/local.config.json and fill in detectedBy + Discord webhook before running again.");
            return 1;
        }

        List<string> passThroughArgs = new List<string>();
        bool hasConfigOverride = false;
        bool hasHuntsOverride = false;
        bool testMode = false;

        for (int index = 0; index < args.Length; index += 1)
        {
            string current = args[index];

            if (string.Equals(current, "--test", StringComparison.OrdinalIgnoreCase))
            {
                testMode = true;
                continue;
            }

            if ((string.Equals(current, "--config", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(current, "--hunts", StringComparison.OrdinalIgnoreCase)) &&
                index + 1 < args.Length)
            {
                if (string.Equals(current, "--config", StringComparison.OrdinalIgnoreCase))
                {
                    hasConfigOverride = true;
                }
                else
                {
                    hasHuntsOverride = true;
                }

                passThroughArgs.Add(current);
                passThroughArgs.Add(args[index + 1]);
                index += 1;
                continue;
            }

            passThroughArgs.Add(current);
        }

        string huntsPath = testMode
            ? Path.Combine("config", "tracked-targets.outrunner.json")
            : Path.Combine("config", "hunts.as-whitelist.json");

        List<string> argumentParts = new List<string>();
        argumentParts.Add("src/server.mjs");

        if (!hasConfigOverride)
        {
            argumentParts.Add("--config");
            argumentParts.Add(Path.Combine("config", "local.config.json"));
        }

        if (!hasHuntsOverride)
        {
            argumentParts.Add("--hunts");
            argumentParts.Add(huntsPath);
        }

        argumentParts.AddRange(passThroughArgs);

        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = nodePath;
        startInfo.Arguments = BuildArguments(argumentParts);
        startInfo.WorkingDirectory = baseDir;
        startInfo.UseShellExecute = false;

        Process process = Process.Start(startInfo);
        if (process == null)
        {
            Console.Error.WriteLine("Failed to start bundled node runtime.");
            return 1;
        }

        process.WaitForExit();
        return process.ExitCode;
    }

    private static bool HasFlag(string[] args, string flag)
    {
        foreach (string arg in args)
        {
            if (string.Equals(arg, flag, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildArguments(IEnumerable<string> values)
    {
        List<string> parts = new List<string>();

        foreach (string value in values)
        {
            parts.Add(Quote(value));
        }

        return string.Join(" ", parts.ToArray());
    }

    private static string Quote(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        if (value.IndexOf(' ') < 0 && value.IndexOf('\t') < 0 && value.IndexOf('"') < 0)
        {
            return value;
        }

        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    private static void PrintHelp()
    {
        Console.WriteLine("ff14-discord-hunt-notify");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  ff14-discord-hunt-notify.exe           Start live A/S whitelist mode");
        Console.WriteLine("  ff14-discord-hunt-notify.exe --test    Start tracked-target test mode");
        Console.WriteLine("  ff14-discord-hunt-notify.exe --config <path> --hunts <path>");
        Console.WriteLine();
        Console.WriteLine("On first run, config/local.config.json is created from config/local.config.example.json if missing.");
    }
}
