namespace ParkDesign.SpacePlanner.Core.Algorithms;

public static class DeterministicSeed
{
    public static int Derive(int masterSeed, string subsystem, int alternativeIndex = 0)
    {
        unchecked
        {
            uint hash = 2166136261;
            foreach (var character in $"{masterSeed}|{alternativeIndex}|{subsystem}")
            {
                hash ^= character;
                hash *= 16777619;
            }
            return (int)(hash & 0x7fffffff);
        }
    }

    public static double Unit(int seed, string key)
    {
        var value = Derive(seed, key);
        return value / (double)int.MaxValue;
    }
}
